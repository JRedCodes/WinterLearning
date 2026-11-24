import type pg from "pg";
import { withTransaction } from "../lib/db.js";
import { hashRequest } from "../lib/hash.js";
import type { Booking } from "../domain/types.js";
import { IdempotencyKeyReusedError, NotFoundError, SoldOutError } from "../domain/errors.js";
import type { ConcertRepository } from "../repositories/concertRepository.js";
import type { BookingRepository } from "../repositories/bookingRepository.js";
import type { WalletRepository } from "../repositories/walletRepository.js";
import type { LedgerRepository } from "../repositories/ledgerRepository.js";
import type { IdempotencyRepository } from "../repositories/idempotencyRepository.js";

export interface BookingServiceDeps {
  pool: pg.Pool;
  concerts: ConcertRepository;
  bookings: BookingRepository;
  wallets: WalletRepository;
  ledger: LedgerRepository;
  idempotency: IdempotencyRepository;
}

export interface BookTicketsInput {
  concertId: number;
  walletId: number;
  quantity: number;
}

export interface BookingResult {
  booking: Booking;
  /** true when this is a stored response replayed for a repeated Idempotency-Key */
  replayed: boolean;
}

export class BookingService {
  constructor(private readonly deps: BookingServiceDeps) {}

  /**
   * Books `quantity` tickets and pays for them from the wallet, all or nothing.
   * If `idempotencyKey` is given, repeating the same request with the same key
   * returns the original booking instead of booking (and charging) again.
   */
  async book(input: BookTicketsInput, idempotencyKey?: string): Promise<BookingResult> {
    const { pool, concerts, bookings, wallets, ledger, idempotency } = this.deps;
    const requestHash = hashRequest({ ...input });

    if (idempotencyKey) {
      const previous = await idempotency.find(pool, idempotencyKey);
      if (previous) {
        if (previous.requestHash !== requestHash) throw new IdempotencyKeyReusedError();
        return { booking: previous.body as Booking, replayed: true };
      }
    }

    const booking = await withTransaction(pool, async (tx) => {
      const concert = await concerts.findById(tx, input.concertId);
      if (!concert) throw new NotFoundError("Concert", input.concertId);

      const sold = await concerts.countTicketsSold(tx, concert.id);
      if (sold + input.quantity > concert.capacity) {
        throw new SoldOutError(concert.id, input.quantity);
      }

      const totalCents = concert.priceCents * input.quantity;
      await wallets.adjustBalance(tx, input.walletId, -totalCents);

      const created = await bookings.insert(tx, { ...input, totalCents });
      await ledger.add(tx, {
        walletId: input.walletId,
        amountCents: -totalCents,
        kind: "booking",
        reference: `booking:${created.id}`,
      });
      return created;
    });

    if (idempotencyKey) {
      await idempotency.save(pool, idempotencyKey, requestHash, 201, booking);
    }
    return { booking, replayed: false };
  }

  async get(id: number): Promise<Booking> {
    const booking = await this.deps.bookings.findById(this.deps.pool, id);
    if (!booking) throw new NotFoundError("Booking", id);
    return booking;
  }
}
