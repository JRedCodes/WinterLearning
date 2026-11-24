import express from "express";
import type { CacheMetrics } from "./cache/cacheMetrics.js";
import type { ProductService } from "./services/productService.js";
import { productsRouter } from "./routes/products.js";
import { metricsRouter } from "./routes/metrics.js";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";

export interface AppDeps {
  productService: ProductService;
  cacheMetrics: CacheMetrics;
}

/** Builds the Express app. No listen(), no process.env: server.ts does that. */
export function createApp(deps: AppDeps) {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "100kb" }));

  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });
  app.use("/products", productsRouter(deps.productService));
  app.use("/metrics", metricsRouter(deps.cacheMetrics));

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
