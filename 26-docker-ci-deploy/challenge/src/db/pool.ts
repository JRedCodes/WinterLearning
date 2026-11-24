import pg from "pg";

export function createPool(connectionString: string): pg.Pool {
  return new pg.Pool({
    connectionString,
    max: 10,
    // Fail fast instead of hanging forever when the DB is unreachable.
    connectionTimeoutMillis: 3_000,
    idleTimeoutMillis: 30_000,
  });
}

/** For readiness probes: true if the DB answers `SELECT 1`, never throws. */
export async function pingDatabase(pool: pg.Pool): Promise<boolean> {
  try {
    await pool.query("SELECT 1");
    return true;
  } catch {
    return false;
  }
}
