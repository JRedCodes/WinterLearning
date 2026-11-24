import type pg from "pg";
import type { Product, ProductPatch } from "../domain/product.js";
import type { ProductRepository } from "./productRepository.js";

interface ProductRow {
  id: string; // bigint comes back from pg as a string
  sku: string;
  name: string;
  description: string;
  price_cents: number;
  stock: number;
  updated_at: Date;
}

const COLUMNS = "id, sku, name, description, price_cents, stock, updated_at";

function toProduct(row: ProductRow): Product {
  return {
    id: row.id,
    sku: row.sku,
    name: row.name,
    description: row.description,
    priceCents: row.price_cents,
    stock: row.stock,
    updatedAt: row.updated_at.toISOString(),
  };
}

export interface PgProductRepositoryOptions {
  /**
   * Artificial latency for findById, standing in for an expensive query
   * (joins across pricing, inventory, reviews...). Implemented with
   * pg_sleep so the cost is really paid by the database.
   */
  queryDelayMs?: number;
}

/**
 * The "slow" source of truth. You don't need to change this file.
 */
export class PgProductRepository implements ProductRepository {
  readonly #delaySeconds: number;

  constructor(
    private readonly pool: pg.Pool,
    options: PgProductRepositoryOptions = {},
  ) {
    this.#delaySeconds = (options.queryDelayMs ?? 0) / 1000;
  }

  async findById(id: string): Promise<Product | null> {
    const { rows } = await this.pool.query<ProductRow>(
      `SELECT ${COLUMNS} FROM products, pg_sleep($2) WHERE id = $1`,
      [id, this.#delaySeconds],
    );
    return rows[0] ? toProduct(rows[0]) : null;
  }

  async update(id: string, patch: ProductPatch): Promise<Product | null> {
    const { rows } = await this.pool.query<ProductRow>(
      `UPDATE products SET
         name        = COALESCE($2, name),
         description = COALESCE($3, description),
         price_cents = COALESCE($4, price_cents),
         stock       = COALESCE($5, stock),
         updated_at  = now()
       WHERE id = $1
       RETURNING ${COLUMNS}`,
      [id, patch.name ?? null, patch.description ?? null, patch.priceCents ?? null, patch.stock ?? null],
    );
    return rows[0] ? toProduct(rows[0]) : null;
  }
}
