import express from "express";
import type { OrderService } from "./services/orderService.js";
import type { UserDirectory } from "./repositories/userDirectory.js";
import { requestId } from "./middleware/requestId.js";
import { notFoundHandler } from "./middleware/notFound.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { ordersRouter } from "./routes/orders.js";

export interface AppDeps {
  orderService: OrderService;
  users: UserDirectory;
}

export function createApp(deps: AppDeps) {
  const app = express();
  app.disable("x-powered-by");
  app.use(requestId());
  app.use(express.json({ limit: "100kb" }));

  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });
  app.use("/orders", ordersRouter(deps.orderService, deps.users));

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
