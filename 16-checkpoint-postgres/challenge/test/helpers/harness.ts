import http from "node:http";
import type { AddressInfo } from "node:net";
import pg from "pg";
import request from "supertest";
import { buildApp } from "../../src/compose.js";
import { migrate } from "../../src/db/migrate.js";

export const DATABASE_URL = process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5433/wl_16";
export const POOL_MAX = 10;

/** Empty `public` schema, then YOUR migrate() on top of it. */
export async function resetDatabase(): Promise<void> {
  const admin = new pg.Client({ connectionString: DATABASE_URL });
  await admin.connect();
  try {
    // Kill sessions a previous test may have left holding locks.
    await admin.query(
      `SELECT pg_terminate_backend(pid) FROM pg_stat_activity
        WHERE datname = current_database() AND pid <> pg_backend_pid()`,
    );
    await admin.query("DROP SCHEMA public CASCADE");
    await admin.query("CREATE SCHEMA public");
  } finally {
    await admin.end();
  }
  const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 1 });
  try {
    await migrate(pool);
  } finally {
    await pool.end();
  }
}

export interface Harness {
  pool: pg.Pool;
  api: () => ReturnType<typeof request>;
  sql<T extends pg.QueryResultRow = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T[]>;
  close(): Promise<void>;
}

export async function startHarness(): Promise<Harness> {
  await resetDatabase();

  const pool = new pg.Pool({ connectionString: DATABASE_URL, max: POOL_MAX, connectionTimeoutMillis: 2000 });
  pool.on("error", () => {});
  pool.on("connect", (client) => client.on("error", () => {}));
  // Warm the pool so concurrent requests really run concurrently.
  const warm = await Promise.all(Array.from({ length: POOL_MAX }, () => pool.connect()));
  for (const c of warm) c.release();

  const app = buildApp({ pool });
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  const base = `http://127.0.0.1:${port}`;

  const admin = new pg.Client({ connectionString: DATABASE_URL });
  await admin.connect();

  return {
    pool,
    api: () => request(base),
    async sql(text, params) {
      const { rows } = await admin.query(text, params);
      return rows;
    },
    async close() {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await admin.end();
      await Promise.race([pool.end(), new Promise((r) => setTimeout(r, 300))]);
    },
  };
}

/* ---------- seeding through the public API ---------- */

let skuCounter = 0;

export interface ProductDto {
  id: number;
  sku: string;
  name: string;
  description: string | null;
  priceCents: number;
  createdAt: string;
}

export async function createProduct(
  h: Harness,
  overrides: Partial<{ sku: string; name: string; description: string; priceCents: number }> = {},
): Promise<ProductDto> {
  skuCounter += 1;
  const body = { sku: `SKU-${skuCounter}`, name: `Product ${skuCounter}`, priceCents: 1000, ...overrides };
  const res = await h.api().post("/products").send(body);
  if (res.status !== 201) throw new Error(`POST /products failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.data;
}

let whCounter = 0;
export async function createWarehouse(h: Harness, code?: string): Promise<{ id: number; code: string; name: string }> {
  whCounter += 1;
  const res = await h.api().post("/warehouses").send({ code: code ?? `WH-${whCounter}`, name: `Warehouse ${whCounter}` });
  if (res.status !== 201) throw new Error(`POST /warehouses failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.data;
}

export async function setStock(h: Harness, warehouseId: number, productId: number, available: number) {
  const res = await h.api().put(`/warehouses/${warehouseId}/stock/${productId}`).send({ available });
  if (res.status !== 200) throw new Error(`PUT stock failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.data;
}

export async function availableStock(h: Harness, warehouseId: number, productId: number): Promise<number> {
  const rows = await h.sql<{ available: number }>(
    "SELECT available FROM stock_levels WHERE warehouse_id = $1 AND product_id = $2",
    [warehouseId, productId],
  );
  return Number(rows[0]?.available ?? 0);
}

export async function placeOrder(
  h: Harness,
  warehouseId: number,
  lines: { productId: number; quantity: number }[],
  customerId = "cust-1",
) {
  return h.api().post("/orders").send({ customerId, warehouseId, lines });
}

export function countStatuses(responses: { status: number }[]): Record<number, number> {
  const counts: Record<number, number> = {};
  for (const r of responses) counts[r.status] = (counts[r.status] ?? 0) + 1;
  return counts;
}
