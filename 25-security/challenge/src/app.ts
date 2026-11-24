import express from "express";
import type pg from "pg";
import { FileStorage } from "./lib/storage.js";
import { UrlImporter, type FetchLike, type ResolveHost } from "./lib/urlImporter.js";
import { cors } from "./middleware/cors.js";
import { errorHandler, notFound } from "./middleware/errorHandler.js";
import { FileRepository } from "./repositories/fileRepository.js";
import { UserRepository } from "./repositories/userRepository.js";
import { apiRoutes } from "./routes/index.js";
import { FileService } from "./services/fileService.js";
import { UserService } from "./services/userService.js";

export interface AppDeps {
  pool: pg.Pool;
  storageDir: string;
  corsOrigins: string[];
  /** Network access for "import from URL". Injected so tests never hit the real network. */
  fetch: FetchLike;
  resolveHost: ResolveHost;
}

export function createApp(deps: AppDeps) {
  const users = new UserRepository(deps.pool);
  const fileService = new FileService(
    new FileRepository(deps.pool),
    new FileStorage(deps.storageDir),
    new UrlImporter(deps.fetch, deps.resolveHost),
  );
  const userService = new UserService(users);

  const app = express();

  app.use(cors({ allowedOrigins: deps.corsOrigins }));
  app.use(express.json({ limit: "1mb" }));

  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });
  app.use(apiRoutes({ users, fileService, userService }));

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
