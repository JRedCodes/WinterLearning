import pg from "pg";
import type { Config } from "../config.js";

/**
 * Anything you can run a query on: a Pool (checks out a connection per
 * query) or a single PoolClient (one connection, e.g. inside a transaction).
 * Repositories depend on this, so the same code works in and out of a
 * transaction.
 */
export interface Queryable {
  query<R extends pg.QueryResultRow = pg.QueryResultRow>(
    text: string,
    values?: unknown[],
  ): Promise<pg.QueryResult<R>>;
}

export type PoolConfig = Pick<Config, "databaseUrl" | "poolMax" | "appName">;

/** One pool per process, created in the composition root. */
export function createPool(config: PoolConfig): pg.Pool {
  const pool = new pg.Pool({
    connectionString: config.databaseUrl,
    max: config.poolMax,
    application_name: config.appName,
    // Give up quickly instead of hanging forever when the pool is exhausted
    // or the database is unreachable.
    connectionTimeoutMillis: 5_000,
    // Close connections that sat idle for 30s (the pool reopens on demand).
    idleTimeoutMillis: 30_000,
  });

  // An idle client can error (e.g. the server restarted). Without a listener,
  // that 'error' event would crash the whole process.
  pool.on("error", (err) => {
    console.error("[pg] idle client error:", err.message);
  });

  return pool;
}
