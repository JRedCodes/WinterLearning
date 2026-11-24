import pg from "pg";

/** One pool per process. Size it with the database's max_connections in mind (see module 13). */
export function createPool(opts: { connectionString: string; max: number }): pg.Pool {
  return new pg.Pool({
    connectionString: opts.connectionString,
    max: opts.max,
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 10_000,
  });
}
