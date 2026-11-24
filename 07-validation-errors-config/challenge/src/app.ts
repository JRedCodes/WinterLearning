import express from "express";
import type { Config } from "./config.js";
import type { Logger } from "./lib/logger.js";
import { createErrorHandler } from "./middleware/errorHandler.js";
import { notFoundHandler } from "./middleware/notFound.js";
import { productsRouter } from "./routes/products.js";
import type { ProductService } from "./services/productService.js";

export interface AppDeps {
  productService: ProductService;
  logger: Logger;
  config: Pick<Config, "pagination" | "apiKey">;
}

export function createApp(deps: AppDeps) {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "100kb" }));

  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });
  app.use(
    "/products",
    productsRouter({
      productService: deps.productService,
      pagination: deps.config.pagination,
      apiKey: deps.config.apiKey,
    }),
  );

  app.use(notFoundHandler);
  app.use(createErrorHandler(deps.logger));
  return app;
}
