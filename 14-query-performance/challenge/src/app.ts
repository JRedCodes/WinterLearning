import express from "express";
import type { Services } from "./container.js";
import { createFeedController } from "./controllers/feedController.js";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";
import { createRoutes } from "./routes/index.js";

export function createApp({ feedService, userService }: Services) {
  const app = express();
  app.disable("x-powered-by");
  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });
  app.use(createRoutes(createFeedController(feedService, userService)));
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
