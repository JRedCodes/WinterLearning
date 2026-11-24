import type pg from "pg";

/** Only `connect()` is needed, which makes this easy to fake in unit tests. */
export type TransactionPool = Pick<pg.Pool, "connect">;

/**
 * TODO(3): withTransaction
 *
 * Run `fn` inside a database transaction on ONE dedicated connection.
 *
 *  1. Check a client out of the pool (`await pool.connect()`).
 *  2. Send BEGIN on that client.
 *  3. Call `fn(client)`. Every query in the transaction must go through this
 *     client: `pool.query()` could pick a different connection, which would
 *     run outside the transaction.
 *  4. If fn resolves: COMMIT and return fn's result.
 *  5. If fn (or COMMIT) throws: ROLLBACK, then rethrow the ORIGINAL error.
 *  6. ALWAYS release the client back to the pool, exactly once, whatever
 *     happened. A leaked client = one fewer connection, forever.
 *  7. If ROLLBACK itself fails, the connection is in an unknown state. Don't
 *     hand it to the next request: release it with the error,
 *     `client.release(err)`, which tells the pool to destroy it. Still rethrow
 *     the original error, not the rollback error.
 */
export async function withTransaction<T>(
  pool: TransactionPool,
  fn: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  void pool;
  void fn;
  throw new Error("Not implemented: withTransaction (TODO 3)");
}
