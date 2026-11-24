import { Router } from "express";
import type { authController } from "../controllers/authController.js";
import { requireAuth } from "../middleware/authenticate.js";

export function authRoutes(c: ReturnType<typeof authController>): Router {
  const router = Router();
  router.post("/register", c.register);
  router.post("/login", c.login);
  router.post("/logout", c.logout); // works with or without a session: logging out is always "successful"
  router.post("/logout-all", requireAuth, c.logoutEverywhere);
  router.get("/me", requireAuth, c.me);
  return router;
}
