import express from "express";
import type { Container } from "./container.js";
import { adminController } from "./controllers/adminController.js";
import { authController } from "./controllers/authController.js";
import { documentController } from "./controllers/documentController.js";
import { authenticate } from "./middleware/authenticate.js";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";
import { adminRoutes } from "./routes/adminRoutes.js";
import { authRoutes } from "./routes/authRoutes.js";
import { documentRoutes } from "./routes/documentRoutes.js";

/** Builds the Express app from already-wired dependencies. No listen(), no process.env. */
export function createApp(c: Container) {
  const app = express();
  app.disable("x-powered-by");

  app.use(express.json({ limit: "100kb" }));

  // Figure out WHO is calling (or nobody). Rejecting requests is left to
  // requireAuth / requireRole on the routes that need it.
  app.use(authenticate({ sessions: c.sessions, users: c.users }));

  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });
  app.use("/auth", authRoutes(authController(c.authService, c.cookie)));
  app.use("/documents", documentRoutes(documentController(c.documentService)));
  app.use("/admin", adminRoutes(adminController(c.userService)));

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
