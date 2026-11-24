/** `npm run migrate`: creates wl_31 if needed and applies every pending migration. Provided. */
import pg from "pg";
import { loadConfig } from "../config.js";
import { ensureDatabase, migrate } from "./migrate.js";

const config = loadConfig();

try {
  await ensureDatabase(config.databaseUrl);
  const pool = new pg.Pool({ connectionString: config.databaseUrl });
  try {
    const applied = await migrate(pool, config.migrationsDir);
    console.log(applied.length ? `applied: ${applied.join(", ")}` : "nothing to apply");
  } finally {
    await pool.end();
  }
} catch (err) {
  console.error("migrations failed:", err);
  process.exitCode = 1;
}
