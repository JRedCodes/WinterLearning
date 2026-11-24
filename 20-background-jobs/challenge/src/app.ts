import express from "express";
import type { SignupService } from "./services/signupService.js";
import { usersRouter } from "./routes/users.js";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";

export interface AppDeps {
  signupService: SignupService;
}

/** Builds the HTTP app. Knows nothing about BullMQ: it talks to the service. */
export function createApp(deps: AppDeps) {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "10kb" }));

  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });
  app.use(usersRouter(deps.signupService));

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
