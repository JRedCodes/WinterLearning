import type { ErrorRequestHandler, RequestHandler } from "express";
import { DomainError, ValidationError } from "../domain/errors.js";

/** Domain error code -> HTTP status. The only place that knows this mapping. */
const STATUS_BY_CODE: Record<string, number> = {
  VALIDATION_ERROR: 400,
  INVALID_CREDENTIALS: 401,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  EMAIL_TAKEN: 409,
};

export const notFoundHandler: RequestHandler = (req, res) => {
  res.status(404).json({ error: { code: "ROUTE_NOT_FOUND", message: `Cannot ${req.method} ${req.path}` } });
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  if (res.headersSent) return;

  if (err instanceof DomainError) {
    const status = STATUS_BY_CODE[err.code] ?? 400;
    const body: Record<string, unknown> = { code: err.code, message: err.message };
    if (err instanceof ValidationError && err.details.length > 0) body.details = err.details;
    if (status === 401) res.setHeader("WWW-Authenticate", 'Cookie realm="wl-22"');
    res.status(status).json({ error: body });
    return;
  }

  if (typeof err === "object" && err !== null && (err as { type?: unknown }).type === "entity.parse.failed") {
    res.status(400).json({ error: { code: "INVALID_JSON", message: "Request body is not valid JSON" } });
    return;
  }

  console.error(`[error] ${req.method} ${req.originalUrl}`, err);
  res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Something went wrong" } });
};
