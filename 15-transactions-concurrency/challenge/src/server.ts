import { loadConfig } from "./config.js";
import { createPool } from "./lib/db.js";
import { buildServices } from "./container.js";
import { createApp } from "./app.js";
import { migrate } from "./db/migrate.js";
import { consoleLogger } from "./lib/logger.js";

// Composition root: the only place that knows about config, the real pool and ports.
const config = loadConfig();
const pool = createPool({
  connectionString: config.DATABASE_URL,
  max: config.DB_POOL_MAX,
  connectionTimeoutMillis: config.DB_CONNECTION_TIMEOUT_MS,
});

await migrate(pool);
const app = createApp({ services: buildServices(pool), logger: consoleLogger });
const server = app.listen(config.PORT, () => {
  consoleLogger.info(`tickets api listening on http://localhost:${config.PORT}`);
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    consoleLogger.info(`${signal} received, shutting down`);
    server.close(async () => {
      await pool.end();
      process.exit(0);
    });
  });
}
