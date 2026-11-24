import { Router } from "express";
import type { projectController } from "../controllers/projectController.js";
import type { taskController } from "../controllers/taskController.js";
import type { IdempotencyStore } from "../repositories/idempotencyStore.js";
import { idempotency } from "../middleware/idempotency.js";

/**
 * /v1/projects and the tasks collection nested under a project.
 * Nesting stops at one level: a task, once created, lives at /v1/tasks/:taskId.
 */
export function projectRoutes(
  projects: ReturnType<typeof projectController>,
  tasks: ReturnType<typeof taskController>,
  idempotencyStore: IdempotencyStore,
): Router {
  const router = Router();
  router.get("/", projects.list);
  router.post("/", projects.create);
  router.get("/:projectId", projects.get);
  router.get("/:projectId/tasks", tasks.list);
  router.post("/:projectId/tasks", idempotency(idempotencyStore), tasks.create);
  return router;
}
