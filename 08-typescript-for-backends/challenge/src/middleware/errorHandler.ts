import type { ErrorRequestHandler } from "express";
import { DomainError } from "../domain/errors.js";
import { HttpError } from "../lib/httpError.js";

const STATUS_BY_CODE: any = {
  ORDER_NOT_FOUND: 404,
  UNKNOWN_SKU: 422,
  INVALID_TRANSITION: 409,
  ORDER_NOT_CANCELLABLE: 409,
  CARRIER_BAD_RESPONSE: 502,
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const errorHandler: ErrorRequestHandler = (err: any, req, res, _next) => {
  const requestId = res.locals.requestId;
  let status = 500;
  let error: any = { code: "INTERNAL_ERROR", message: "Something went wrong", requestId };

  if (err instanceof HttpError) {
    status = err.status;
    error = { code: err.code, message: err.message, requestId, details: err.details };
  } else if (err instanceof DomainError) {
    status = STATUS_BY_CODE[err.code] ?? 500;
    error = { code: err.code, message: err.message, requestId };
  } else if (err?.type === "entity.parse.failed") {
    status = 400;
    error = { code: "INVALID_JSON", message: "Request body is not valid JSON", requestId };
  } else {
    console.error(`[${requestId}] unhandled error on ${req.method} ${req.originalUrl}`, err);
  }

  if (res.headersSent) return;
  res.status(status).json({ error });
};
