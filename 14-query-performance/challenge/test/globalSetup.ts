import { fileURLToPath } from "node:url";
import pg from "pg";
import { resetAndSeed } from "../src/db/seed.js";

const DATABASE_URL = process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5433/wl_14";

/**
 * Runs once before all test files:
 *  1. creates the wl_14 database if needed,
 *  2. drops the schema and applies EVERY migration in migrations/ (yours too),
 *  3. loads the seed data and runs ANALYZE so the planner has fresh statistics.
 */
export default async function setup(): Promise<void> {
  const url = new URL(DATABASE_URL);
  const dbName = url.pathname.slice(1);
  url.pathname = "/postgres";
  const admin = new pg.Client({ connectionString: url.toString(), connectionTimeoutMillis: 3_000 });
  try {
    await admin.connect();
  } catch (err) {
    throw new Error(`Postgres not reachable at ${url.host}. Run \`make up\` first. (${(err as Error).message})`);
  }
  try {
    const { rowCount } = await admin.query("SELECT 1 FROM pg_database WHERE datname = $1", [dbName]);
    if (!rowCount) await admin.query(`CREATE DATABASE "${dbName}"`);
  } finally {
    await admin.end();
  }

  const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 2 });
  try {
    await resetAndSeed(pool, {
      migrationsDir: fileURLToPath(new URL("../migrations", import.meta.url)),
      seedFile: fileURLToPath(new URL("../seed/seed.sql", import.meta.url)),
    });
  } finally {
    await pool.end();
  }
}
