import type { Queryable } from "../lib/db.js";
import type { PricedItem } from "./productRepository.js";

export interface Order {
  id: string;
  customerId: string;
  totalCents: number;
  currency: string;
  createdAt: string;
  items: PricedItem[];
}

interface OrderRow {
  id: string;
  customer_id: string;
  total_cents: number;
  currency: string;
  created_at: Date;
}

export class OrderRepository {
  async insert(db: Queryable, order: { id: string; customerId: string; totalCents: number; currency: string }): Promise<Order> {
    const { rows } = await db.query<OrderRow>(
      `INSERT INTO orders (id, customer_id, total_cents, currency) VALUES ($1, $2, $3, $4)
       RETURNING id, customer_id, total_cents, currency, created_at`,
      [order.id, order.customerId, order.totalCents, order.currency],
    );
    return toOrder(rows[0]!, []);
  }

  async insertItems(db: Queryable, orderId: string, items: PricedItem[]): Promise<void> {
    for (const item of items) {
      await db.query(
        "INSERT INTO order_items (order_id, sku, quantity, unit_price_cents) VALUES ($1, $2, $3, $4)",
        [orderId, item.sku, item.quantity, item.unitPriceCents],
      );
    }
  }

  async findById(db: Queryable, id: string): Promise<Order | undefined> {
    const { rows } = await db.query<OrderRow>(
      "SELECT id, customer_id, total_cents, currency, created_at FROM orders WHERE id = $1",
      [id],
    );
    if (!rows[0]) return undefined;
    const items = await db.query<{ sku: string; quantity: number; unit_price_cents: number }>(
      "SELECT sku, quantity, unit_price_cents FROM order_items WHERE order_id = $1 ORDER BY sku",
      [id],
    );
    return toOrder(
      rows[0],
      items.rows.map((r) => ({ sku: r.sku, quantity: r.quantity, unitPriceCents: r.unit_price_cents })),
    );
  }
}

function toOrder(row: OrderRow, items: PricedItem[]): Order {
  return {
    id: row.id,
    customerId: row.customer_id,
    totalCents: row.total_cents,
    currency: row.currency.trim(),
    createdAt: row.created_at.toISOString(),
    items,
  };
}
