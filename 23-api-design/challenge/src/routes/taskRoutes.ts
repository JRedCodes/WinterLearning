import { Router } from "express";
import type { taskController } from "../controllers/taskController.js";

export function taskRoutes(tasks: ReturnType<typeof taskController>): Router {
  const router = Router();
  router.get("/:taskId", tasks.get);
  router.patch("/:taskId", tasks.update);
  router.delete("/:taskId", tasks.remove);
  return router;
}
