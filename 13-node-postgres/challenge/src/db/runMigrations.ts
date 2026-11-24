/**
 * CLI entry: `npm run migrate` (or `make migrate`).
 * Applies pending migrations and exits. This is the "separate step" style:
 * in production you'd run it from your deploy pipeline before rolling out
 * new app instances (see module 26).
 */
import { loadConfig } from "../config.js";
import { migrate } from "./migrate.js";
import { createPool } from "./pool.js";

const config = loadConfig();
const pool = createPool(config);
try {
  const applied = await migrate(pool, { dir: config.migrationsDir, log: console.log });
  console.log(applied.length ? `done: ${applied.length} migration(s) applied` : "done: already up to date");
} catch (err) {
  console.error(err);
  process.exitCode = 1;
} finally {
  await pool.end();
}
