import express from "express";
import { silentLogger, type Logger } from "./lib/logger.js";
import { errorHandler, notFound } from "./middleware/errorHandler.js";
import { orderRoutes } from "./orders/orderRoutes.js";
import type { OrderService } from "./orders/orderService.js";

export interface AppDeps {
  orderService: OrderService;
  logger?: Logger;
}

/** Builds the orders API. No listen(), no process.env. */
export function createApp(deps: AppDeps) {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "100kb" }));
  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });
  app.use("/orders", orderRoutes(deps.orderService));
  app.use(notFound);
  app.use(errorHandler(deps.logger ?? silentLogger));
  return app;
}
