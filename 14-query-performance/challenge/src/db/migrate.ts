import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type pg from "pg";

const MIGRATION_FILE = /^\d+_[\w-]+\.sql$/;

/**
 * The migration runner you built in module 13 (compact version): applies
 * NNN_name.sql files in order, one transaction each, tracked in
 * schema_migrations. Returns the versions applied by this run.
 */
export async function migrate(pool: pg.Pool, dir: string): Promise<string[]> {
  await pool.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`);
  const files = (await readdir(dir)).filter((f) => MIGRATION_FILE.test(f)).sort();
  const applied: string[] = [];

  for (const file of files) {
    const version = file.slice(0, -".sql".length);
    const client = await pool.connect();
    let broken: Error | undefined;
    try {
      await client.query("BEGIN");
      const done = await client.query("SELECT 1 FROM schema_migrations WHERE version = $1", [version]);
      if (!done.rowCount) {
        await client.query(await readFile(join(dir, file), "utf8"));
        await client.query("INSERT INTO schema_migrations (version) VALUES ($1)", [version]);
        applied.push(version);
      }
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK").catch((e: Error) => (broken = e));
      throw new Error(`Migration ${file} failed: ${(err as Error).message}`, { cause: err });
    } finally {
      client.release(broken);
    }
  }
  return applied;
}
