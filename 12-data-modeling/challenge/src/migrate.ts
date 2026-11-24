import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type pg from "pg";

/**
 * A deliberately tiny, forward-only migration runner. You don't need to change it.
 *
 *  - Migrations are files in `dir` named `NNN_description.sql` (e.g. `002_rooms.sql`),
 *    applied in file-name order.
 *  - Each migration runs inside its own transaction together with the bookkeeping
 *    INSERT, so it is applied completely or not at all. (Postgres can run DDL like
 *    CREATE TABLE inside a transaction; many databases can't.)
 *  - Applied migrations are recorded in `schema_migrations` with a checksum. Editing a
 *    migration that was already applied is an error: write a new migration instead.
 *  - An advisory lock stops two app instances from migrating at the same time.
 *
 * Real projects use a tool for this (node-pg-migrate, Flyway, Sqitch, Prisma Migrate,
 * Drizzle Kit...). They all do roughly this, plus more. Module 13 has you build one.
 */

export const MIGRATION_FILE = /^(\d{3})_([a-z0-9_]+)\.sql$/;

const LOCK_KEY = 1112; // any constant shared by every runner of this app

export interface MigrationFile {
  version: string; // "002"
  name: string; // "002_rooms.sql"
  sql: string;
  checksum: string;
}

export async function readMigrations(dir: string): Promise<MigrationFile[]> {
  const entries = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();
  const files: MigrationFile[] = [];
  for (const name of entries) {
    const match = MIGRATION_FILE.exec(name);
    if (!match) {
      throw new Error(`Bad migration file name "${name}": expected NNN_lower_snake_case.sql`);
    }
    const sql = await readFile(join(dir, name), "utf8");
    files.push({ version: match[1]!, name, sql, checksum: sha256(sql) });
  }
  const versions = files.map((f) => f.version);
  const dup = versions.find((v, i) => versions.indexOf(v) !== i);
  if (dup) throw new Error(`Two migrations share the version number ${dup}`);
  return files;
}

/** Apply every pending migration in `dir`. Returns the names of the migrations applied. */
export async function migrate(client: pg.ClientBase, dir: string): Promise<string[]> {
  const files = await readMigrations(dir);
  await client.query("SELECT pg_advisory_lock($1)", [LOCK_KEY]);
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version    text        PRIMARY KEY,
        name       text        NOT NULL,
        checksum   text        NOT NULL,
        applied_at timestamptz NOT NULL DEFAULT now()
      )`);
    const { rows } = await client.query<{ version: string; checksum: string; name: string }>(
      "SELECT version, name, checksum FROM schema_migrations",
    );
    const applied = new Map(rows.map((r) => [r.version, r]));

    const done: string[] = [];
    for (const file of files) {
      const previous = applied.get(file.version);
      if (previous) {
        if (previous.checksum !== file.checksum) {
          throw new Error(
            `Migration ${file.name} was changed after it was applied. ` +
              "Applied migrations are immutable: revert your edit and add a new migration instead " +
              "(or run `npm run db:reset` while developing locally).",
          );
        }
        continue;
      }
      try {
        await client.query("BEGIN");
        await client.query(file.sql);
        await client.query(
          "INSERT INTO schema_migrations (version, name, checksum) VALUES ($1, $2, $3)",
          [file.version, file.name, file.checksum],
        );
        await client.query("COMMIT");
        done.push(file.name);
      } catch (err) {
        await client.query("ROLLBACK");
        const pgErr = err as { message?: string; code?: string };
        throw new Error(`Migration ${file.name} failed: ${pgErr.message ?? String(err)}`, {
          cause: err,
        });
      }
    }
    return done;
  } finally {
    await client.query("SELECT pg_advisory_unlock($1)", [LOCK_KEY]);
  }
}

function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}
