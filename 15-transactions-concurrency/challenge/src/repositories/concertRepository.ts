import type { Queryable } from "../lib/db.js";
import { toNumber } from "../lib/db.js";
import type { Concert } from "../domain/types.js";

interface ConcertRow {
  id: string;
  name: string;
  capacity: number;
  price_cents: string;
  tickets_sold: string;
}

const toConcert = (r: ConcertRow): Concert => ({
  id: toNumber(r.id),
  name: r.name,
  capacity: r.capacity,
  priceCents: toNumber(r.price_cents),
  ticketsSold: toNumber(r.tickets_sold),
});

export class ConcertRepository {
  async create(
    db: Queryable,
    input: { name: string; capacity: number; priceCents: number },
  ): Promise<Concert> {
    const { rows } = await db.query<ConcertRow>(
      `INSERT INTO concerts (name, capacity, price_cents)
       VALUES ($1, $2, $3)
       RETURNING id, name, capacity, price_cents, 0::bigint AS tickets_sold`,
      [input.name, input.capacity, input.priceCents],
    );
    return toConcert(rows[0]!);
  }

  async findById(db: Queryable, id: number): Promise<Concert | undefined> {
    const { rows } = await db.query<ConcertRow>(
      `SELECT c.id, c.name, c.capacity, c.price_cents,
              COALESCE((SELECT SUM(b.quantity) FROM bookings b WHERE b.concert_id = c.id), 0) AS tickets_sold
         FROM concerts c
        WHERE c.id = $1`,
      [id],
    );
    return rows[0] ? toConcert(rows[0]) : undefined;
  }

  /** How many tickets have been booked for this concert so far. */
  async countTicketsSold(db: Queryable, concertId: number): Promise<number> {
    const { rows } = await db.query<{ sold: string }>(
      "SELECT COALESCE(SUM(quantity), 0) AS sold FROM bookings WHERE concert_id = $1",
      [concertId],
    );
    return toNumber(rows[0]!.sold);
  }
}
