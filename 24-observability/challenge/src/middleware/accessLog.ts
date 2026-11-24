import type { RequestHandler } from "express";
import type { Logger } from "../lib/logger.js";

/**
 * One structured line per request, written when the response finishes.
 * Raw URLs are fine HERE: logs are built for high-cardinality detail.
 * (Metrics are not. See httpMetrics.ts.)
 */
export function accessLog(): RequestHandler {
  return (req, res, next) => {
    const start = performance.now();
    res.on("finish", () => {
      const log = res.locals.logger as Logger;
      const statusCode = res.statusCode;
      const level = statusCode >= 500 ? "error" : statusCode >= 400 ? "warn" : "info";
      log[level](
        {
          method: req.method,
          url: req.originalUrl,
          statusCode,
          durationMs: Math.round((performance.now() - start) * 100) / 100,
        },
        "request completed",
      );
    });
    next();
  };
}
