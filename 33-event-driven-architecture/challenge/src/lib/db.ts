import pg from "pg";

/**
 * Anything you can run a query on: the Pool (auto-commit) or a PoolClient that
 * is inside a transaction. Repositories accept a Queryable so the SERVICE
 * decides what is part of a transaction (see module 15).
 */
export type Queryable = pg.Pool | pg.PoolClient;

export function createPool(connectionString: string, max = 10): pg.Pool {
  return new pg.Pool({ connectionString, max, connectionTimeoutMillis: 2000 });
}

/** BEGIN → fn → COMMIT, or ROLLBACK and re-throw. The client is always released. */
export async function withTransaction<T>(pool: pg.Pool, fn: (tx: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/** Postgres error code for unique_violation. */
export const UNIQUE_VIOLATION = "23505";

export function pgErrorCode(err: unknown): string | undefined {
  return typeof err === "object" && err !== null && "code" in err ? String((err as { code: unknown }).code) : undefined;
}
