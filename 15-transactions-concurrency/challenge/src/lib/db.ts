import pg from "pg";

/**
 * Anything you can run a query on: the Pool (auto-commit, one statement per
 * checkout) or a PoolClient that is inside a transaction.
 * Repositories accept a Queryable so the *service* decides whether a call is
 * part of a transaction or not.
 */
export type Queryable = pg.Pool | pg.PoolClient;

export interface PoolOptions {
  connectionString: string;
  max: number;
  connectionTimeoutMillis: number;
}

export function createPool(opts: PoolOptions): pg.Pool {
  return new pg.Pool({
    connectionString: opts.connectionString,
    max: opts.max,
    // Without this, a request waits FOREVER for a free connection when the
    // pool is exhausted. With it, it fails fast with "timeout exceeded".
    connectionTimeoutMillis: opts.connectionTimeoutMillis,
  });
}

/**
 * Runs `fn` inside BEGIN/COMMIT on one dedicated connection.
 *  - If `fn` throws, the transaction is rolled back and the error re-thrown.
 *  - The connection always goes back to the pool (finally).
 */
export async function withTransaction<T>(
  pool: pg.Pool,
  fn: (tx: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {
      /* connection may already be broken; the original error matters more */
    });
    throw err;
  } finally {
    client.release();
  }
}

/** Postgres returns bigint (int8) columns as strings. Convert safely. */
export function toNumber(value: string | number): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(n)) throw new Error(`Not a safe integer: ${value}`);
  return n;
}
