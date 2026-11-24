import type { ErrorRequestHandler, RequestHandler } from "express";
import { DomainError } from "../domain/errors.js";
import type { Logger } from "../lib/logger.js";

const STATUS: Record<string, number> = {
  VALIDATION_FAILED: 400,
  UNKNOWN_SKU: 422,
  OUT_OF_STOCK: 409,
};

export const notFound: RequestHandler = (req, res) => {
  res.status(404).json({ error: { code: "ROUTE_NOT_FOUND", message: `Cannot ${req.method} ${req.path}` } });
};

/** Domain errors → their status; everything else → generic 500 (logged). */
export function errorHandler(logger: Logger): ErrorRequestHandler {
  return (err, req, res, _next) => {
    if (res.headersSent) return;
    if (err instanceof DomainError) {
      res.status(STATUS[err.code] ?? 400).json({ error: { code: err.code, message: err.message } });
      return;
    }
    if (typeof err === "object" && err !== null && (err as { type?: string }).type === "entity.parse.failed") {
      res.status(400).json({ error: { code: "INVALID_JSON", message: "Malformed JSON body" } });
      return;
    }
    logger.error("unhandled error", { method: req.method, path: req.path, error: (err as Error)?.message });
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Something went wrong" } });
  };
}
