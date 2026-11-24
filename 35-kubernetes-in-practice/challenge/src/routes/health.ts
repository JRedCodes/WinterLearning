import { hostname } from "node:os";
import { Router } from "express";

export interface HealthDeps {
  /** Resolves true when the database answers. Must never throw. */
  checkDatabase: () => Promise<boolean>;
  /** True once SIGTERM has been received and we're draining. */
  isShuttingDown: () => boolean;
  appVersion: string;
}

/**
 * The endpoints your probes will point at:
 *
 *  GET /healthz  liveness:  "is this process alive?" If this fails, the kubelet RESTARTS the
 *                container. So: no dependency checks. A DB outage must not restart every pod.
 *  GET /readyz   readiness: "should this pod receive traffic right now?" If this fails, the pod
 *                is removed from the Service's endpoints (not restarted). Checks the DB and the
 *                shutdown flag.
 *  GET /whoami   not a probe: shows which pod answered and which version it runs. Handy for
 *                watching load balancing and rolling updates from your terminal.
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

  router.get("/whoami", (_req, res) => {
    // Inside a pod, the hostname IS the pod name (e.g. kudos-api-7c9d8b6f4-x2k9p).
    res.json({ pod: hostname(), version: deps.appVersion });
  });

  return router;
}
