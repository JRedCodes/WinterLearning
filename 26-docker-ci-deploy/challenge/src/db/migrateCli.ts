/**
 * One-off migration step: `npm run migrate` locally, `node dist/db/migrateCli.js` in the image.
 * In the compose stack this runs as the `migrate` service BEFORE the api starts; in a real
 * pipeline it is a separate deploy step (or a Kubernetes Job), never part of app startup.
 */
import { loadConfig } from "../config.js";
import { createLogger } from "../lib/logger.js";
import { ensureDatabase, migrate } from "./migrate.js";
import { createPool } from "./pool.js";

const config = loadConfig();
const logger = createLogger(config.logLevel);

try {
  await ensureDatabase(config.databaseUrl);
  const pool = createPool(config.databaseUrl);
  try {
    const applied = await migrate(pool, config.migrationsDir);
    logger.info("migrations complete", { applied });
  } finally {
    await pool.end();
  }
} catch (err) {
  logger.error("migrations failed", { err });
  process.exitCode = 1;
}
