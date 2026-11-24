import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import type pg from "pg";
import { loadConfig } from "../config.js";
import { migrate } from "./migrate.js";
import { createPool } from "./pool.js";

export interface ResetOptions {
  migrationsDir: string;
  seedFile: string;
}

/**
 * Drops everything, applies ALL migrations (including the ones you add),
 * loads the seed data and refreshes planner statistics (ANALYZE).
 * Used by `npm run seed` and by the test globalSetup.
 */
export async function resetAndSeed(pool: pg.Pool, { migrationsDir, seedFile }: ResetOptions): Promise<string[]> {
  await pool.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
  const applied = await migrate(pool, migrationsDir);
  await pool.query(await readFile(seedFile, "utf8"));
  await pool.query("ANALYZE");
  return applied;
}

// CLI: npm run seed
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const config = loadConfig();
  const pool = createPool(config);
  const started = performance.now();
  try {
    const applied = await resetAndSeed(pool, { migrationsDir: config.migrationsDir, seedFile: "seed/seed.sql" });
    console.log(`migrations: ${applied.join(", ")}`);
    console.log(`seeded in ${((performance.now() - started) / 1000).toFixed(1)}s`);
  } catch (err) {
    console.error(err);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}
