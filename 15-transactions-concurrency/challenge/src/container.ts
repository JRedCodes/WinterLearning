import type pg from "pg";
import { ConcertRepository } from "./repositories/concertRepository.js";
import { BookingRepository } from "./repositories/bookingRepository.js";
import { WalletRepository } from "./repositories/walletRepository.js";
import { LedgerRepository } from "./repositories/ledgerRepository.js";
import { IdempotencyRepository } from "./repositories/idempotencyRepository.js";
import { ConcertService } from "./services/concertService.js";
import { BookingService } from "./services/bookingService.js";
import { WalletService } from "./services/walletService.js";

export interface Services {
  concerts: ConcertService;
  wallets: WalletService;
  bookings: BookingService;
}

/** Wires repositories into services. Called by server.ts and by the tests. */
export function buildServices(pool: pg.Pool): Services {
  const concerts = new ConcertRepository();
  const bookings = new BookingRepository();
  const wallets = new WalletRepository();
  const ledger = new LedgerRepository();
  const idempotency = new IdempotencyRepository();

  return {
    concerts: new ConcertService({ pool, concerts }),
    wallets: new WalletService({ pool, wallets, ledger }),
    bookings: new BookingService({ pool, concerts, bookings, wallets, ledger, idempotency }),
  };
}
