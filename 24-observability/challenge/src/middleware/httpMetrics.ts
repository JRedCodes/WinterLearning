import type { RequestHandler } from "express";
import type { HttpMetrics } from "../lib/metrics.js";

/** Records http_request_duration_seconds for every request when the response finishes. */
export function httpMetrics(metrics: HttpMetrics): RequestHandler {
  return (req, res, next) => {
    const start = Date.now();
    res.on("finish", () => {
      metrics.httpRequestDuration.observe(
        { method: req.method, route: req.originalUrl, status_code: String(res.statusCode) },
        Date.now() - start,
      );
    });
    next();
  };
}
