import type { Queryable } from "../lib/db.js";
import { toNumber } from "../lib/db.js";
import type { Booking } from "../domain/types.js";

interface BookingRow {
  id: string;
  concert_id: string;
  wallet_id: string;
  quantity: number;
  total_cents: string;
  created_at: Date;
}

const toBooking = (r: BookingRow): Booking => ({
  id: toNumber(r.id),
  concertId: toNumber(r.concert_id),
  walletId: toNumber(r.wallet_id),
  quantity: r.quantity,
  totalCents: toNumber(r.total_cents),
  createdAt: r.created_at.toISOString(),
});

const COLUMNS = "id, concert_id, wallet_id, quantity, total_cents, created_at";

export class BookingRepository {
  async insert(
    db: Queryable,
    input: { concertId: number; walletId: number; quantity: number; totalCents: number },
  ): Promise<Booking> {
    const { rows } = await db.query<BookingRow>(
      `INSERT INTO bookings (concert_id, wallet_id, quantity, total_cents)
       VALUES ($1, $2, $3, $4)
       RETURNING ${COLUMNS}`,
      [input.concertId, input.walletId, input.quantity, input.totalCents],
    );
    return toBooking(rows[0]!);
  }

  async findById(db: Queryable, id: number): Promise<Booking | undefined> {
    const { rows } = await db.query<BookingRow>(`SELECT ${COLUMNS} FROM bookings WHERE id = $1`, [id]);
    return rows[0] ? toBooking(rows[0]) : undefined;
  }
}
