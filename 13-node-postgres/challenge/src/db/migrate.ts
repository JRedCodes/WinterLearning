import type pg from "pg";

export interface MigrateOptions {
  /** Directory containing NNN_name.sql files. */
  dir: string;
  /** Called once per applied migration, e.g. console.log. */
  log?: (message: string) => void;
}

/**
 * TODO(5): A tiny migration runner
 *
 * Contract (see test/migrate.test.ts):
 *  - Migration files match /^\d+_[\w-]+\.sql$/ (e.g. "001_create_projects.sql").
 *    Ignore everything else in the directory (READMEs, .DS_Store, ...).
 *  - A migration's version is its filename without ".sql": "001_create_projects".
 *  - Apply files in filename order (names are zero-padded, so a plain sort works).
 *  - Track applied versions in a table you create if it doesn't exist:
 *      schema_migrations (version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())
 *  - Skip versions that are already recorded, so running migrate twice is safe.
 *  - Apply each migration AND record its version in the same transaction
 *    (use your withTransaction). If a migration fails, none of its statements
 *    stick, it isn't recorded, and migrate rejects with an Error whose message
 *    contains the failing file's name. Earlier migrations stay applied.
 *  - Resolve with the versions applied by THIS run, in order ([] if none).
 *
 * Tip: a migration file can contain several statements. `client.query(sql)`
 * with no parameters runs them all.
 */
export async function migrate(pool: pg.Pool, options: MigrateOptions): Promise<string[]> {
  void pool;
  void options;
  throw new Error("Not implemented: migrate (TODO 5)");
}
