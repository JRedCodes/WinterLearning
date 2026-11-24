import express from "express";
import type { Logger } from "./lib/logger.js";
import { silentLogger } from "./lib/logger.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { notFoundHandler } from "./middleware/notFound.js";
import { healthRouter, type HealthDeps } from "./routes/health.js";
import { kudosRouter } from "./routes/kudos.js";
import type { KudosService } from "./services/kudosService.js";

export interface AppDeps extends HealthDeps {
  kudos: KudosService;
  logger?: Logger;
}

/** Builds the Express app. No listen(), no environment reads: that's server.ts' job. */
export function createApp(deps: AppDeps) {
  const logger = deps.logger ?? silentLogger;
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "16kb" }));

  app.use(healthRouter(deps));
  app.use("/kudos", kudosRouter(deps.kudos));

  app.use(notFoundHandler);
  app.use(errorHandler(logger));
  return app;
}
