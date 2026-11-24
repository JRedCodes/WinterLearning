/**
 * Composition root: config -> pool -> repository -> service -> app -> listen.
 * Also owns the shutdown sequence that makes rolling updates drop zero requests.
 */
import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import { createPool, databaseCheck } from "./db/pool.js";
import { createLifecycle } from "./lib/lifecycle.js";
import { createLogger } from "./lib/logger.js";
import { PgKudosRepository } from "./repositories/pgKudosRepository.js";
import { KudosService } from "./services/kudosService.js";

const config = loadConfig();
const logger = createLogger(config.logLevel);
const pool = createPool(config.db);
const lifecycle = createLifecycle();

const app = createApp({
  kudos: new KudosService(new PgKudosRepository(pool)),
  checkDatabase: databaseCheck(pool),
  isShuttingDown: lifecycle.isShuttingDown,
  appVersion: config.appVersion,
  logger,
});

const server = app.listen(config.port, () => {
  logger.info("kudos api listening", { port: config.port, version: config.appVersion, dbHost: config.db.host });
});

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function shutdown(signal: string) {
  if (lifecycle.isShuttingDown()) return;
  lifecycle.beginShutdown(); // /readyz now answers 503
  logger.info("shutdown started", { signal, delayMs: config.shutdownDelayMs });

  // Endpoint removal is asynchronous: keep serving while the rest of the cluster notices.
  await sleep(config.shutdownDelayMs);

  const force = setTimeout(() => {
    logger.warn("drain timeout hit, forcing exit");
    process.exit(1);
  }, config.shutdownTimeoutMs);
  force.unref();

  server.close(async () => {
    await pool.end().catch(() => {});
    logger.info("shutdown complete");
    process.exit(0);
  });
  server.closeIdleConnections();
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
