import { Router } from "express";
import type { Registry } from "prom-client";

/** Prometheus scrapes this endpoint (text exposition format). */
export function metricsRoutes(registry: Registry): Router {
  const router = Router();
  router.get("/metrics", async (_req, res) => {
    res.setHeader("Content-Type", registry.contentType);
    res.send(await registry.metrics());
  });
  return router;
}
