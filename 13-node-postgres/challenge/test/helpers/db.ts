import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

export const DATABASE_URL =
  process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5433/wl_13";

export const MIGRATIONS_DIR = fileURLToPath(new URL("../../migrations", import.meta.url));

/** A small pool that fails fast (instead of hanging) if connections leak. */
export function createTestPool(overrides: pg.PoolConfig = {}): pg.Pool {
  const pool = new pg.Pool({
    connectionString: DATABASE_URL,
    max: 4,
    connectionTimeoutMillis: 3_000,
    ...overrides,
  });
  pool.on("error", () => {});
  return pool;
}

/** Wipes everything: tables, schema_migrations, functions, triggers. */
export async function resetSchema(pool: pg.Pool): Promise<void> {
  await pool.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
}

/**
 * Applies the module's migrations directly, WITHOUT your migrate() function,
 * so repository tests don't depend on TODO 5.
 */
export async function applySchema(pool: pg.Pool): Promise<void> {
  await resetSchema(pool);
  const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith(".sql")).sort();
  for (const file of files) {
    await pool.query(await readFile(join(MIGRATIONS_DIR, file), "utf8"));
  }
}

export async function truncateAll(pool: pg.Pool): Promise<void> {
  await pool.query("TRUNCATE tasks, projects RESTART IDENTITY CASCADE");
}

export async function countRows(pool: pg.Pool, table: "tasks" | "projects"): Promise<number> {
  const { rows } = await pool.query<{ n: number }>(`SELECT count(*)::int AS n FROM ${table}`);
  return rows[0]?.n ?? 0;
}
