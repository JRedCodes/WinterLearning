import type { Queryable } from "../lib/db.js";

export interface PricedItem {
  sku: string;
  quantity: number;
  unitPriceCents: number;
}

export class ProductRepository {
  /** Looks up current prices. Returns only the SKUs that exist. */
  async prices(db: Queryable, skus: string[]): Promise<Map<string, number>> {
    const { rows } = await db.query<{ sku: string; price_cents: number }>(
      "SELECT sku, price_cents FROM products WHERE sku = ANY($1::text[])",
      [skus],
    );
    return new Map(rows.map((r) => [r.sku, r.price_cents]));
  }

  /**
   * Decrements stock atomically. Returns false if there wasn't enough
   * (the WHERE clause makes the check-and-decrement a single statement: no race).
   */
  async reserve(db: Queryable, sku: string, quantity: number): Promise<boolean> {
    const { rowCount } = await db.query(
      "UPDATE products SET stock = stock - $2 WHERE sku = $1 AND stock >= $2",
      [sku, quantity],
    );
    return rowCount === 1;
  }
}
