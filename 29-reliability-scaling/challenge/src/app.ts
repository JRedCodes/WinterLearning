import express from "express";
import { HttpError } from "./lib/httpError.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { productsRouter } from "./routes/products.js";
import type { ProductOverviewService } from "./services/productOverviewService.js";

export interface AppDeps {
  overview: ProductOverviewService;
}

export function createApp(deps: AppDeps) {
  const app = express();
  app.disable("x-powered-by");

  // Liveness: "the process is up". Deliberately does NOT check downstreams:
  // if it did, a pricing outage would make the orchestrator restart every
  // healthy aggregator instance, turning a partial outage into a full one.
  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  // For humans and dashboards: which dependencies are we currently shielding ourselves from?
  app.get("/health/dependencies", (_req, res) => {
    res.json({ breakers: deps.overview.breakerStates() });
  });

  app.use("/products", productsRouter(deps.overview));

  app.use((req, _res, next) => {
    next(new HttpError(404, "ROUTE_NOT_FOUND", `Cannot ${req.method} ${req.path}`));
  });
  app.use(errorHandler);
  return app;
}
