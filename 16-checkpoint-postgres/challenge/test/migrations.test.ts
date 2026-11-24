import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate } from "../src/db/migrate.js";
import { DATABASE_URL, resetDatabase } from "./helpers/harness.js";

describe("migrations", () => {
  let pool: pg.Pool;
  beforeAll(async () => {
    await resetDatabase();
    pool = new pg.Pool({ connectionString: DATABASE_URL, max: 2 });
  });
  afterAll(async () => {
    await pool.end();
  });

  it("creates the required tables", async () => {
    const { rows } = await pool.query<{ table_name: string }>(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'",
    );
    const tables = rows.map((r) => r.table_name);
    for (const t of ["schema_migrations", "products", "warehouses", "stock_levels", "orders", "order_lines"]) {
      expect(tables, `table ${t}`).toContain(t);
    }
  });

  it("records applied migrations and is idempotent", async () => {
    const before = await pool.query("SELECT count(*)::int AS n FROM schema_migrations");
    expect(before.rows[0].n, "at least one migration recorded").toBeGreaterThan(0);
    const appliedAgain = await migrate(pool);
    expect(appliedAgain, "second run applies nothing").toEqual([]);
    const after = await pool.query("SELECT count(*)::int AS n FROM schema_migrations");
    expect(after.rows[0].n).toBe(before.rows[0].n);
  });

  it("enforces stock can never go negative at the database level", async () => {
    const p = await pool.query("INSERT INTO products (sku, name, price_cents) VALUES ('X-1', 'x', 1) RETURNING id");
    const w = await pool.query("INSERT INTO warehouses (code, name) VALUES ('W-1', 'w') RETURNING id");
    await expect(
      pool.query("INSERT INTO stock_levels (warehouse_id, product_id, available) VALUES ($1, $2, -1)", [
        w.rows[0].id,
        p.rows[0].id,
      ]),
      "a CHECK constraint should reject available < 0",
    ).rejects.toThrow();
  });

  it("has a trigram (pg_trgm GIN) index for product name search", async () => {
    const { rows } = await pool.query<{ indexdef: string }>(
      "SELECT indexdef FROM pg_indexes WHERE tablename = 'products'",
    );
    expect(
      rows.some((r) => /USING gin/i.test(r.indexdef) && /gin_trgm_ops/.test(r.indexdef) && /\bname\b/.test(r.indexdef)),
      `indexes on products:\n${rows.map((r) => r.indexdef).join("\n")}`,
    ).toBe(true);
  });

  it("has an index supporting 'orders of a customer, newest first'", async () => {
    const { rows } = await pool.query<{ indexdef: string }>("SELECT indexdef FROM pg_indexes WHERE tablename = 'orders'");
    expect(
      rows.some((r) => /\(customer_id\s*,\s*created_at/.test(r.indexdef)),
      `indexes on orders:\n${rows.map((r) => r.indexdef).join("\n")}`,
    ).toBe(true);
  });
});
