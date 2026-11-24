import type pg from "pg";

/**
 * Applies every not-yet-applied `migrations/*.sql` file, in file-name order,
 * each inside its own transaction, recording applied names in a
 * `schema_migrations` table.
 *
 * Returns the names of the files applied by THIS call ([] when up to date).
 * The tests call it on an empty schema before every test.
 */
export async function migrate(_pool: pg.Pool): Promise<string[]> {
  throw new Error("Not implemented: write your migration runner in src/db/migrate.ts");
}
