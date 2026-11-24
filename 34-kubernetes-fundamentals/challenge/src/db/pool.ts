import pg from "pg";
import type { AppConfig } from "../config.js";

export function createPool(db: AppConfig["db"]): pg.Pool {
  return new pg.Pool({
    host: db.host,
    port: db.port,
    database: db.database,
    user: db.user,
    password: db.password,
    max: 10,
    // Fail fast: a readiness probe that hangs for 30s is worse than one that says "no".
    connectionTimeoutMillis: 2_000,
    idleTimeoutMillis: 30_000,
  });
}

/** Readiness check: true if Postgres answers within the pool's connection timeout. Never throws. */
export function databaseCheck(pool: pg.Pool): () => Promise<boolean> {
  return async () => {
    try {
      await pool.query("SELECT 1");
      return true;
    } catch {
      return false;
    }
  };
}
