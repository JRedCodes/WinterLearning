import type { ErrorRequestHandler } from "express";
import type { Logger } from "../lib/logger.js";

/**
 * TODO(6): The central error handler. The ONLY place errors become HTTP.
 *
 * Response body: { "error": { "code": string, "message": string, "details"?: FieldIssue[] } }
 *
 *  ValidationError    → 400, include `details`
 *  UnauthorizedError  → 401
 *  NotFoundError      → 404   (any subclass: map the CATEGORY, not each leaf)
 *  ConflictError      → 409
 *  BusinessRuleError  → 422
 *  malformed JSON     → 400 "INVALID_JSON"   (express.json sets err.type === "entity.parse.failed")
 *  anything else      → 500 "INTERNAL_ERROR", message "Something went wrong".
 *                       Log it with logger.error(…, { err, method, path }).
 *                       Never send the real message to the client.
 *
 * Expected errors (AppError) are part of normal operation: log them at debug
 * level at most, NOT with logger.error, or your alerts will fire on every typo.
 *
 * The current version leaks internal messages and treats everything as a 500.
 */
export function createErrorHandler(_logger: Logger): ErrorRequestHandler {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  return (err, _req, res, _next) => {
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: String(err?.message ?? err) } });
  };
}
