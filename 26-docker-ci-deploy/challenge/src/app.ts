import express from "express";
import type { Logger } from "./lib/logger.js";
import { silentLogger } from "./lib/logger.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { notFoundHandler } from "./middleware/notFound.js";
import { healthRouter, type HealthDeps } from "./routes/health.js";
import { parcelsRouter } from "./routes/parcels.js";
import type { ParcelService } from "./services/parcelService.js";

export interface AppDeps extends HealthDeps {
  parcels: ParcelService;
  logger?: Logger;
}

/** Builds the Express app. No listen(), no environment reads: that is server.ts' job. */
export function createApp(deps: AppDeps) {
  const logger = deps.logger ?? silentLogger;
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "100kb" }));

  app.use(healthRouter(deps));
  app.use("/parcels", parcelsRouter(deps.parcels));

  app.use(notFoundHandler);
  app.use(errorHandler(logger));
  return app;
}
