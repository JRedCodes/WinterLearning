import http from "node:http";
import type { AddressInfo } from "node:net";
import pg from "pg";
import request from "supertest";
import { createApp } from "../../src/app.js";
import { buildServices } from "../../src/container.js";
import { createPool } from "../../src/lib/db.js";
import { migrate } from "../../src/db/migrate.js";

export const DATABASE_URL = process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5433/wl_15";
export const POOL_MAX = 10;

/**
 * Drops everything and re-applies migrations. Also kills any session that a
 * previous (buggy) test left behind holding locks or an open transaction.
 */
export async function resetDatabase(): Promise<void> {
  const admin = new pg.Client({ connectionString: DATABASE_URL });
  await admin.connect();
  try {
    await admin.query(
      `SELECT pg_terminate_backend(pid) FROM pg_stat_activity
        WHERE datname = current_database() AND pid <> pg_backend_pid()`,
    );
    await admin.query("DROP SCHEMA public CASCADE");
    await admin.query("CREATE SCHEMA public");
  } finally {
    await admin.end();
  }
  const pool = createPool({ connectionString: DATABASE_URL, max: 1, connectionTimeoutMillis: 5000 });
  try {
    await migrate(pool);
  } finally {
    await pool.end();
  }
}

export interface Harness {
  pool: pg.Pool;
  /** supertest bound to a real listening server (so requests truly run concurrently) */
  api: () => ReturnType<typeof request>;
  /** messages the app logged for unexpected (500) errors */
  errors: string[];
  /** one-off query against the database, outside the app's pool */
  sql<T extends pg.QueryResultRow = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T[]>;
  close(): Promise<void>;
}

export async function startHarness(): Promise<Harness> {
  await resetDatabase();

  const pool = createPool({ connectionString: DATABASE_URL, max: POOL_MAX, connectionTimeoutMillis: 1000 });
  // A leaked client that resetDatabase() later kills would otherwise crash the
  // test run with "Connection terminated unexpectedly". Swallow those.
  pool.on("error", () => {});
  pool.on("connect", (client) => client.on("error", () => {}));
  // Warm the pool like a long-running server would be: open all connections
  // now, so concurrent requests aren't serialized behind connection setup.
  const warm = await Promise.all(Array.from({ length: POOL_MAX }, () => pool.connect()));
  for (const c of warm) c.release();

  const errors: string[] = [];
  const app = createApp({
    services: buildServices(pool),
    logger: { info: () => {}, error: (msg) => errors.push(msg) },
  });
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  const base = `http://127.0.0.1:${port}`;

  const admin = new pg.Client({ connectionString: DATABASE_URL });
  await admin.connect();

  return {
    pool,
    errors,
    api: () => request(base),
    async sql(text, params) {
      const { rows } = await admin.query(text, params);
      return rows;
    },
    async close() {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await admin.end();
      // A leaked (never released) client would make pool.end() wait forever.
      await Promise.race([pool.end(), new Promise((r) => setTimeout(r, 300))]);
    },
  };
}

/* ---------- seeding through the public API ---------- */

export async function createConcert(h: Harness, capacity: number, priceCents = 100) {
  const res = await h.api().post("/concerts").send({ name: `Concert x${capacity}`, capacity, priceCents });
  if (res.status !== 201) throw new Error(`POST /concerts failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.data as { id: number; capacity: number; priceCents: number; ticketsSold: number };
}

export async function createWallet(h: Harness, initialBalanceCents: number, owner = "fan") {
  const res = await h.api().post("/wallets").send({ owner, initialBalanceCents });
  if (res.status !== 201) throw new Error(`POST /wallets failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.data as { id: number; balanceCents: number };
}

export async function balanceOf(h: Harness, walletId: number): Promise<number> {
  const res = await h.api().get(`/wallets/${walletId}`);
  if (res.status !== 200) throw new Error(`GET /wallets/${walletId} failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.data.balanceCents as number;
}

/** balance_cents vs SUM(ledger) for every wallet; returns the mismatches. */
export async function ledgerMismatches(h: Harness) {
  return h.sql<{ id: string; balance: string; ledger: string }>(
    `SELECT w.id, w.balance_cents AS balance, COALESCE(SUM(l.amount_cents), 0) AS ledger
       FROM wallets w LEFT JOIN ledger_entries l ON l.wallet_id = w.id
      GROUP BY w.id
     HAVING w.balance_cents <> COALESCE(SUM(l.amount_cents), 0)`,
  );
}

/** Groups responses by status code: { 201: 5, 409: 25 } */
export function countStatuses(responses: { status: number }[]): Record<number, number> {
  const counts: Record<number, number> = {};
  for (const r of responses) counts[r.status] = (counts[r.status] ?? 0) + 1;
  return counts;
}

export function describeErrors(h: Harness): string {
  return h.errors.length ? `\nserver logged:\n  ${[...new Set(h.errors)].slice(0, 5).join("\n  ")}` : "";
}
