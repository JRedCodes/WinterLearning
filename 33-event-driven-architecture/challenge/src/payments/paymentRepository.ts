import type { Queryable } from "../lib/db.js";

export interface NewPayment {
  orderId: string;
  customerId: string;
  amountCents: number;
  currency: string;
  eventId: string;
}

export interface Payment extends NewPayment {
  id: string;
}

export class PaymentRepository {
  async insert(db: Queryable, p: NewPayment): Promise<Payment> {
    const { rows } = await db.query<{ id: string }>(
      `INSERT INTO payments (order_id, customer_id, amount_cents, currency, event_id)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [p.orderId, p.customerId, p.amountCents, p.currency, p.eventId],
    );
    return { id: rows[0]!.id, ...p };
  }

  async forOrder(db: Queryable, orderId: string): Promise<Payment[]> {
    const { rows } = await db.query<{ id: string; order_id: string; customer_id: string; amount_cents: number; currency: string; event_id: string }>(
      "SELECT id, order_id, customer_id, amount_cents, currency, event_id FROM payments WHERE order_id = $1 ORDER BY id",
      [orderId],
    );
    return rows.map((r) => ({
      id: r.id,
      orderId: r.order_id,
      customerId: r.customer_id,
      amountCents: r.amount_cents,
      currency: r.currency.trim(),
      eventId: r.event_id,
    }));
  }
}
