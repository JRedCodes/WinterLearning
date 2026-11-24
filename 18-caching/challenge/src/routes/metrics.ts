import { Router } from "express";
import type { CacheMetrics } from "../cache/cacheMetrics.js";

/**
 * TODO(7b): GET /metrics/cache
 *
 * Respond 200 with the metrics snapshot as the JSON body (no { data } wrapper,
 * metrics endpoints are read by tools, not by the frontend):
 *   { "hits": 3, "misses": 1, "coalesced": 0, "errors": 0, "hitRatio": 0.75 }
 *
 * Also set `Cache-Control: no-store`: a metrics endpoint served from some
 * HTTP cache would be worse than useless.
 */
export function metricsRouter(metrics: CacheMetrics): Router {
  const router = Router();
  void metrics;
  return router;
}
