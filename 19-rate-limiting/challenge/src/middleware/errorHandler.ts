import type { ErrorRequestHandler, RequestHandler } from "express";
import { HttpError } from "../lib/httpError.js";

/** Nothing matched: forward a 404 so errorHandler owns the response format. */
export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(new HttpError(404, "ROUTE_NOT_FOUND", `Cannot ${req.method} ${req.path}`));
};

/** Same shape as module 05: { error: { code, message } }. Unknown errors → generic 500. */
export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  let status = 500;
  let code = "INTERNAL_ERROR";
  let message = "Something went wrong";

  if (err instanceof HttpError) {
    ({ status, code, message } = err);
  } else if (typeof err === "object" && err !== null && "type" in err && err.type === "entity.parse.failed") {
    status = 400;
    code = "INVALID_JSON";
    message = "Request body is not valid JSON";
  } else {
    console.error(`[error] ${req.method} ${req.originalUrl}`, err);
  }

  if (res.headersSent) return;
  res.status(status).json({ error: { code, message } });
};
