import type { RequestHandler } from "express";

/**
 * TODO(5): Unknown routes
 *
 * Runs only when no route matched. Respond 404 with the standard error shape:
 *   { "error": { "code": "ROUTE_NOT_FOUND", "message": "Cannot GET /nope", "requestId": "..." } }
 *
 * Tip: you can also create an HttpError and pass it to next(), so the error
 * handler stays the ONLY place that formats error responses.
 */
export const notFoundHandler: RequestHandler = (_req, _res, next) => {
  next();
};
