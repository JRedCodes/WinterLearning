import type { ErrorRequestHandler } from "express";
import { NotFoundError, UpstreamUnavailableError } from "../domain/errors.js";
import { HttpError } from "../lib/httpError.js";

/** Maps domain errors to HTTP. The only place that decides status codes for errors. */
export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (res.headersSent) return;
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: { code: err.code, message: err.message } });
    return;
  }
  if (err instanceof NotFoundError) {
    res.status(404).json({ error: { code: "PRODUCT_NOT_FOUND", message: err.message } });
    return;
  }
  if (err instanceof UpstreamUnavailableError) {
    // 503 + Retry-After tells well-behaved clients (and load balancers) to back off.
    res.setHeader("Retry-After", String(err.retryAfterSeconds));
    res.status(503).json({ error: { code: "UPSTREAM_UNAVAILABLE", message: err.message } });
    return;
  }
  console.error(err);
  res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Something went wrong" } });
};
