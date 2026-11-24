import express from "express";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";
import { walletRoutes } from "./routes/wallets.js";
import type { WalletService } from "./services/walletService.js";

export interface AppDeps {
  walletService: WalletService;
}

/** Builds the app without listening, so tests can drive it with supertest. */
export function createApp(deps: AppDeps) {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "100kb" }));

  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });
  app.use(walletRoutes(deps.walletService));

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
