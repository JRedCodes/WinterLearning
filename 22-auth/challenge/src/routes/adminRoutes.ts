import { Router } from "express";
import type { adminController } from "../controllers/adminController.js";
import { requireRole } from "../middleware/authenticate.js";

/** Role-based access control: the whole router is admin-only. */
export function adminRoutes(c: ReturnType<typeof adminController>): Router {
  const router = Router();
  router.use(requireRole("admin"));
  router.get("/users", c.listUsers);
  return router;
}
