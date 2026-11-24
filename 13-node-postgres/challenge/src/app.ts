import express from "express";
import { createTaskController } from "./controllers/taskController.js";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";
import { createRoutes } from "./routes/index.js";
import type { TaskService } from "./services/taskService.js";

export interface AppDeps {
  taskService: TaskService;
}

/**
 * Builds the Express app from already-constructed dependencies.
 * It knows nothing about Postgres: whoever calls createApp decides
 * which repository backs the service (see server.ts and the tests).
 */
export function createApp({ taskService }: AppDeps) {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "100kb" }));

  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });
  app.use(createRoutes(createTaskController(taskService)));

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
