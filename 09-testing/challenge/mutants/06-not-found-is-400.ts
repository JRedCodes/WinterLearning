// @mutant-of: src/middleware/errorHandler.ts
// @mutant: a missing wallet is reported as 400 instead of 404
import type { ErrorRequestHandler, RequestHandler } from "express";
import { DomainError, type DomainErrorCode } from "../domain/errors.js";
import { HttpError } from "../lib/httpError.js";

const STATUS_BY_CODE = {
  WALLET_NOT_FOUND: 400,
  INVALID_AMOUNT: 422,
  INSUFFICIENT_FUNDS: 422,
  DAILY_LIMIT_EXCEEDED: 422,
  SAME_WALLET_TRANSFER: 422,
} satisfies Record<DomainErrorCode, number>;

export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(new HttpError(404, "ROUTE_NOT_FOUND", `Cannot ${req.method} ${req.path}`));
};

function isJsonParseError(err: unknown): boolean {
  return typeof err === "object" && err !== null && "type" in err && err.type === "entity.parse.failed";
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const errorHandler: ErrorRequestHandler = (err: unknown, req, res, _next) => {
  let status = 500;
  let body: { code: string; message: string; details?: unknown } = {
    code: "INTERNAL_ERROR",
    message: "Something went wrong",
  };

  if (err instanceof DomainError) {
    status = STATUS_BY_CODE[err.code];
    body = { code: err.code, message: err.message };
  } else if (err instanceof HttpError) {
    status = err.status;
    body = { code: err.code, message: err.message, details: err.details };
  } else if (isJsonParseError(err)) {
    status = 400;
    body = { code: "INVALID_JSON", message: "Request body is not valid JSON" };
  } else {
    console.error(`unhandled error on ${req.method} ${req.originalUrl}`, err);
  }

  if (res.headersSent) return;
  res.status(status).json({ error: body });
};
