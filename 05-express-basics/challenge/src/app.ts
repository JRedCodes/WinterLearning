import express from "express";
import { NoteStore } from "./lib/noteStore.js";
import { requestId } from "./middleware/requestId.js";
import { notFoundHandler } from "./middleware/notFound.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { notesRouter } from "./routes/notes.js";

export interface AppDeps {
  store?: NoteStore;
}

/**
 * Builds the Express app without starting a server.
 * Tests call this directly with supertest; server.ts calls it and listens.
 *
 * Read this top to bottom: the order of `app.use` IS the order of the
 * middleware chain every request goes through.
 */
export function createApp(deps: AppDeps = {}) {
  const store = deps.store ?? new NoteStore();
  const app = express();

  app.disable("x-powered-by");

  // 1. Runs first for every request, so every response gets an id.
  app.use(requestId());

  // 2. Parses JSON bodies into req.body (rejects bodies over 100kb).
  app.use(express.json({ limit: "100kb" }));

  // 3. Routes.
  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });
  app.use("/notes", notesRouter(store));

  // 4. Nothing matched: 404.
  app.use(notFoundHandler);

  // 5. Error-handling middleware is always registered LAST.
  app.use(errorHandler);

  return app;
}
