import pg from "pg";
import type { Config } from "../config.js";

/** Anything you can run a query on: a Pool, a PoolClient, or the QueryRecorder. */
export interface Queryable {
  query<R extends pg.QueryResultRow = pg.QueryResultRow>(
    text: string,
    values?: unknown[],
  ): Promise<pg.QueryResult<R>>;
}

export function createPool(config: Pick<Config, "databaseUrl" | "poolMax">): pg.Pool {
  const pool = new pg.Pool({
    connectionString: config.databaseUrl,
    max: config.poolMax,
    application_name: "wl-14-feed-api",
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 30_000,
  });
  pool.on("error", (err) => {
    console.error("[pg] idle client error:", err.message);
  });
  return pool;
}
