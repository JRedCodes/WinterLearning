import express from "express";
import { projectController } from "./controllers/projectController.js";
import { taskController } from "./controllers/taskController.js";
import { systemClock, type Clock } from "./lib/clock.js";
import { problemDetails } from "./middleware/problemDetails.js";
import { InMemoryIdempotencyStore, type IdempotencyStore } from "./repositories/idempotencyStore.js";
import { InMemoryProjectRepository } from "./repositories/projectRepository.js";
import { InMemoryTaskRepository } from "./repositories/taskRepository.js";
import { projectRoutes } from "./routes/projectRoutes.js";
import { taskRoutes } from "./routes/taskRoutes.js";
import { ProjectService } from "./services/projectService.js";
import { TaskService } from "./services/taskService.js";

export interface AppDeps {
  clock?: Clock;
  idempotencyStore?: IdempotencyStore;
  problemBaseUrl?: string;
}

export const DEFAULT_PROBLEM_BASE_URL = "https://api.wl.example/problems/";

/** Builds the app with in-memory repositories. No listen(), no process.env. */
export function createApp(deps: AppDeps = {}) {
  const clock = deps.clock ?? systemClock;
  const projectsRepo = new InMemoryProjectRepository();
  const tasksRepo = new InMemoryTaskRepository();
  const projectService = new ProjectService(projectsRepo, clock);
  const taskService = new TaskService(tasksRepo, projectsRepo, clock);
  const idempotencyStore = deps.idempotencyStore ?? new InMemoryIdempotencyStore();
  const problems = problemDetails({ baseUrl: deps.problemBaseUrl ?? DEFAULT_PROBLEM_BASE_URL });

  const app = express();
  app.disable("x-powered-by");
  // PATCH bodies use JSON Merge Patch's media type; accept both.
  app.use(express.json({ limit: "100kb", type: ["application/json", "application/merge-patch+json"] }));

  const tasks = taskController(taskService);
  app.use("/v1/projects", projectRoutes(projectController(projectService), tasks, idempotencyStore));
  app.use("/v1/tasks", taskRoutes(tasks));

  app.use(problems.notFoundHandler);
  app.use(problems.errorHandler);
  return app;
}
