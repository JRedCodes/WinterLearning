import pg from "pg";
import { createApp } from "../../src/app.js";
import { buildServices } from "../../src/container.js";
import { QueryRecorder } from "../../src/db/queryRecorder.js";

export const DATABASE_URL = process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5433/wl_14";

export function createTestPool(): pg.Pool {
  const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 4, connectionTimeoutMillis: 3_000 });
  pool.on("error", () => {});
  return pool;
}

/**
 * The real app, wired exactly like server.ts, except every query goes
 * through a QueryRecorder so tests can see what each request did.
 */
export function createInstrumentedApp(pool: pg.Pool) {
  const recorder = new QueryRecorder(pool);
  const app = createApp(buildServices(recorder));
  return { app, recorder };
}
