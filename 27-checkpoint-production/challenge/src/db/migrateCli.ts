/** `npm run migrate` locally, `node dist/db/migrateCli.js` in a container. */
import pg from "pg";
import { loadConfig } from "../config.js";
import { createLogger } from "../lib/logger.js";
import { ensureDatabase, migrate } from "./migrate.js";

const config = loadConfig();
const logger = createLogger(config.logLevel);

try {
  await ensureDatabase(config.databaseUrl);
  const pool = new pg.Pool({ connectionString: config.databaseUrl });
  try {
    logger.info({ applied: await migrate(pool, config.migrationsDir) }, "migrations complete");
  } finally {
    await pool.end();
  }
} catch (err) {
  logger.error({ err }, "migrations failed");
  process.exitCode = 1;
}
