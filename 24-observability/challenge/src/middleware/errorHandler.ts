import type { ErrorRequestHandler, RequestHandler } from "express";
import { DependencyUnavailableError, DomainError, OrderNotFoundError, PaymentDeclinedError } from "../domain/errors.js";
import type { Logger } from "../lib/logger.js";

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: { path: string; message: string }[],
  ) {
    super(message);
    this.name = "HttpError";
  }
}

const DOMAIN_STATUS = new Map<Function, number>([
  [OrderNotFoundError, 404],
  [PaymentDeclinedError, 402],
  [DependencyUnavailableError, 503],
]);

export const notFound: RequestHandler = (req, _res, next) => {
  next(new HttpError(404, "ROUTE_NOT_FOUND", `Cannot ${req.method} ${req.path}`));
};

/**
 * Maps errors to responses and decides what deserves a log line:
 *  - 4xx: the client's problem. The access log already records it; no extra noise.
 *  - 5xx: our problem (or a dependency's). Log at error level WITH the error
 *    object, so pino's err serializer captures type, message, stack and cause.
 */
export function errorHandler(baseLogger: Logger): ErrorRequestHandler {
  // Express recognizes error handlers by their 4 parameters, so keep all four.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  return (err, req, res, _next) => {
    const log: Logger = res.locals.logger ?? baseLogger;
    let status = 500;
    let code = "INTERNAL_ERROR";
    let message = "Something went wrong";
    let details: unknown;

    if (err instanceof HttpError) {
      ({ status, code, message } = err);
      details = err.details;
    } else if (err instanceof DomainError) {
      status = DOMAIN_STATUS.get(err.constructor) ?? 500;
      code = err.code;
      message = err.message;
    } else if (err?.type === "entity.parse.failed") {
      status = 400;
      code = "INVALID_JSON";
      message = "Request body is not valid JSON";
    }

    if (status >= 500) {
      log.error({ err, method: req.method, url: req.originalUrl }, "request failed");
    }

    if (res.headersSent) return;
    res.status(status).json({
      error: { code, message, requestId: res.locals.requestId, ...(details ? { details } : {}) },
    });
  };
}
