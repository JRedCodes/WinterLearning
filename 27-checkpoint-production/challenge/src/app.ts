import express from "express";
import type { Redis } from "ioredis";
import type pg from "pg";
import type { AppConfig } from "./config.js";
import type { Logger } from "./lib/logger.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { PgNoteRepository } from "./repositories/noteRepository.js";
import { notesRouter } from "./routes/notes.js";
import { NoteService } from "./services/noteService.js";

/**
 * Everything the app may use. The tests build these and call createApp(deps);
 * keep this signature (you can add optional fields).
 */
export interface AppDeps {
  config: AppConfig;
  pool: pg.Pool;
  redis: Redis;
  logger: Logger;
  /** Returns true once graceful shutdown has started. */
  isShuttingDown?: () => boolean;
}

export function createApp(deps: AppDeps) {
  const app = express();
  app.use(express.json());

  app.use((req, _res, next) => {
    console.log(req.method, req.url, req.body);
    next();
  });

  const notes = new NoteService(new PgNoteRepository(deps.pool));
  app.use("/notes", notesRouter(notes));

  app.use(errorHandler);
  return app;
}
