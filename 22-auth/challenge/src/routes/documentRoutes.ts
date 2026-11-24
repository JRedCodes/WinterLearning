import { Router } from "express";
import type { documentController } from "../controllers/documentController.js";
import { requireAuth } from "../middleware/authenticate.js";

/**
 * Authentication is checked here (requireAuth); authorization ("may THIS user
 * touch THIS document?") needs the document, so it lives in DocumentService.
 */
export function documentRoutes(c: ReturnType<typeof documentController>): Router {
  const router = Router();
  router.use(requireAuth);
  router.get("/", c.list);
  router.post("/", c.create);
  router.get("/:id", c.get);
  router.patch("/:id", c.update);
  router.delete("/:id", c.remove);
  return router;
}
