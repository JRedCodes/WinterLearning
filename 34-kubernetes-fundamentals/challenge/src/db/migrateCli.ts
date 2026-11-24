/**
 * One-off migration step.
 *   locally:      npm run migrate
 *   in the image: node dist/db/migrateCli.js   <- what your Kubernetes Job runs
 *
 * Exits 0 on success and 1 on failure, which is exactly what a Job needs: a non-zero exit
 * marks the pod failed and the Job retries it (up to backoffLimit).
 */
import { loadConfig } from "../config.js";
import { createLogger } from "../lib/logger.js";
import { migrate } from "./migrate.js";
import { createPool } from "./pool.js";

const config = loadConfig();
const logger = createLogger(config.logLevel);
const pool = createPool(config.db);

try {
  const applied = await migrate(pool, config.migrationsDir);
  logger.info("migrations complete", { applied, host: config.db.host, database: config.db.database });
} catch (err) {
  logger.error("migrations failed", { err, host: config.db.host });
  process.exitCode = 1;
} finally {
  await pool.end();
}
