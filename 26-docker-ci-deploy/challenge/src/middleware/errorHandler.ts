import type { ErrorRequestHandler } from "express";
import { InvalidTransitionError, ParcelNotFoundError } from "../domain/parcel.js";
import { HttpError } from "../lib/httpError.js";
import type { Logger } from "../lib/logger.js";

/** Maps domain errors and HttpErrors to responses; everything else is a logged, generic 500. */
export function errorHandler(logger: Logger): ErrorRequestHandler {
  // Express identifies error middleware by its 4 parameters.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  return (err, req, res, _next) => {
    let status = 500;
    let error: { code: string; message: string; details?: unknown } = {
      code: "INTERNAL_ERROR",
      message: "Something went wrong",
    };

    if (err instanceof HttpError) {
      status = err.status;
      error = { code: err.code, message: err.message, ...(err.details ? { details: err.details } : {}) };
    } else if (err instanceof ParcelNotFoundError) {
      status = 404;
      error = { code: "NOT_FOUND", message: err.message };
    } else if (err instanceof InvalidTransitionError) {
      status = 409;
      error = { code: "INVALID_TRANSITION", message: err.message };
    } else if (typeof err === "object" && err !== null && (err as { type?: unknown }).type === "entity.parse.failed") {
      status = 400;
      error = { code: "INVALID_JSON", message: "Request body is not valid JSON" };
    } else {
      logger.error("unhandled error", { method: req.method, url: req.originalUrl, err });
    }

    if (res.headersSent) return;
    res.status(status).json({ error });
  };
}
