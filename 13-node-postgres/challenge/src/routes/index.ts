import { Router } from "express";
import type { TaskController } from "../controllers/taskController.js";

/** Routing table: URL + method → controller function. Nothing else. */
export function createRoutes(c: TaskController): Router {
  const router = Router();

  router.post("/projects", c.createProject);
  router.get("/projects/:id", c.getProject);
  router.post("/projects/:projectId/tasks", c.createTask);

  router.get("/tasks", c.listTasks);
  // Registered before /tasks/:id so "move" is never mistaken for an id.
  router.post("/tasks/move", c.moveTasks);
  router.get("/tasks/:id", c.getTask);
  router.patch("/tasks/:id", c.updateTask);
  router.delete("/tasks/:id", c.deleteTask);

  return router;
}
