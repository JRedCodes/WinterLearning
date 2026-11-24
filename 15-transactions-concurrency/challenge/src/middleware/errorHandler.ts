import type { ErrorRequestHandler, RequestHandler } from "express";
import { DomainError } from "../domain/errors.js";
import { RequestValidationError } from "../lib/validation.js";
import type { Logger } from "../lib/logger.js";

const STATUS_BY_CODE: Record<string, number> = {
  NOT_FOUND: 404,
  SOLD_OUT: 409,
  INSUFFICIENT_FUNDS: 422,
  IDEMPOTENCY_KEY_REUSED: 422,
  INVALID_OPERATION: 422,
};

export const notFoundHandler: RequestHandler = (req, res) => {
  res.status(404).json({ error: { code: "ROUTE_NOT_FOUND", message: `Cannot ${req.method} ${req.path}` } });
};

export function errorHandler(logger: Logger): ErrorRequestHandler {
  // Express recognizes error middleware by its 4 parameters.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  return (err, req, res, _next) => {
    if (res.headersSent) return;

    if (err instanceof DomainError) {
      res.status(STATUS_BY_CODE[err.code] ?? 400).json({ error: { code: err.code, message: err.message } });
      return;
    }
    if (err instanceof RequestValidationError) {
      res.status(400).json({ error: { code: "VALIDATION_ERROR", message: err.message, details: err.details } });
      return;
    }
    if (typeof err === "object" && err !== null && (err as { type?: unknown }).type === "entity.parse.failed") {
      res.status(400).json({ error: { code: "INVALID_JSON", message: "Request body is not valid JSON" } });
      return;
    }

    logger.error(`unhandled error on ${req.method} ${req.originalUrl}: ${(err as Error)?.message ?? err}`, {
      pgCode: (err as { code?: unknown })?.code,
    });
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Something went wrong" } });
  };
}
