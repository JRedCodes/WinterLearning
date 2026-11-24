import { Router } from "express";

export interface HealthDeps {
  /** Resolves true when the database answers. Must never throw. */
  checkDatabase: () => Promise<boolean>;
  /** True once graceful shutdown has started: we must stop receiving new traffic. */
  isShuttingDown: () => boolean;
}

/**
 * Liveness vs readiness (module 24 goes deeper):
 *  - /healthz  "is the process alive?"  Restart me if this fails. No dependency checks.
 *  - /readyz   "should I get traffic?"  Fails while the DB is down OR while we are draining
 *              during shutdown, so the load balancer stops sending new requests.
 */
export function healthRouter(deps: HealthDeps): Router {
  const router = Router();

  router.get("/healthz", (_req, res) => {
    res.json({ status: "ok" });
  });

  router.get("/readyz", async (_req, res) => {
    if (deps.isShuttingDown()) {
      res.status(503).json({ status: "shutting_down" });
      return;
    }
    const database = await deps.checkDatabase();
    res.status(database ? 200 : 503).json({ status: database ? "ready" : "unavailable", checks: { database } });
  });

  return router;
}
