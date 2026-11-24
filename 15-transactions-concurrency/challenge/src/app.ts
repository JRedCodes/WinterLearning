import express from "express";
import type { Services } from "./container.js";
import { apiRouter } from "./routes/index.js";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";
import { consoleLogger, type Logger } from "./lib/logger.js";

export interface AppDeps {
  services: Services;
  logger?: Logger;
}

/** Builds the Express app. No listen(), no process.env: see server.ts. */
export function createApp({ services, logger = consoleLogger }: AppDeps) {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "100kb" }));

  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });
  app.use(apiRouter(services));

  app.use(notFoundHandler);
  app.use(errorHandler(logger));
  return app;
}
