import express from "express";
import type { Registry } from "prom-client";
import type { Logger } from "./lib/logger.js";
import type { HttpMetrics } from "./lib/metrics.js";
import type { CheckoutService } from "./services/checkoutService.js";
import { requestContext } from "./middleware/requestContext.js";
import { accessLog } from "./middleware/accessLog.js";
import { httpMetrics } from "./middleware/httpMetrics.js";
import { errorHandler, notFound } from "./middleware/errorHandler.js";
import { healthRoutes, type ReadinessCheck } from "./routes/healthRoutes.js";
import { metricsRoutes } from "./routes/metricsRoutes.js";
import { checkoutRoutes } from "./routes/checkoutRoutes.js";

export interface AppDeps {
  logger: Logger;
  registry: Registry;
  metrics: HttpMetrics;
  checkout: CheckoutService;
  readinessChecks: ReadinessCheck[];
  readinessTimeoutMs?: number;
}

/** Builds the app. No listen(), no process.env: server.ts does that. */
export function createApp(deps: AppDeps) {
  const app = express();
  app.disable("x-powered-by");

  // Observability first, so every request (even ones that fail parsing) is identified, logged and measured.
  app.use(requestContext(deps.logger));
  app.use(accessLog());
  app.use(httpMetrics(deps.metrics));

  app.use(express.json({ limit: "100kb" }));

  app.use(healthRoutes({ checks: deps.readinessChecks, timeoutMs: deps.readinessTimeoutMs ?? 1000 }));
  app.use(metricsRoutes(deps.registry));
  app.use(checkoutRoutes(deps.checkout));

  app.use(notFound);
  app.use(errorHandler(deps.logger));
  return app;
}
