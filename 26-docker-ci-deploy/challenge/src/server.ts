/**
 * Composition root: config -> infrastructure -> services -> app -> lifecycle.
 * The only file that wires real implementations together.
 */
import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import { createPool, pingDatabase } from "./db/pool.js";
import { createLogger } from "./lib/logger.js";
import { createServerLifecycle, installSignalHandlers, type ServerLifecycle } from "./lib/lifecycle.js";
import { PgParcelRepository } from "./repositories/parcelRepository.js";
import { ParcelService } from "./services/parcelService.js";

const config = loadConfig();
const logger = createLogger(config.logLevel);
const pool = createPool(config.databaseUrl);

// `lifecycle` is assigned below; /readyz only calls isShuttingDown() at request time.
let lifecycle: ServerLifecycle | undefined;

const app = createApp({
  parcels: new ParcelService(new PgParcelRepository(pool)),
  checkDatabase: () => pingDatabase(pool),
  isShuttingDown: () => lifecycle?.isShuttingDown() ?? false,
  logger,
});

lifecycle = createServerLifecycle({
  handler: app,
  port: config.port,
  drainTimeoutMs: config.shutdownTimeoutMs,
  onShutdown: [{ name: "postgres", close: () => pool.end() }],
  logger,
});

const port = await lifecycle.start();
logger.info("parcels api listening", { port });
installSignalHandlers(lifecycle, process, logger);
