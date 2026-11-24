import type { ErrorRequestHandler, RequestHandler } from "express";
import { ZodError } from "zod";
import { ProjectNotFoundError, TaskNotFoundError } from "../domain/errors.js";

interface ErrorBody {
  code: string;
  message: string;
  details?: { path: string; message: string }[];
}

/** Maps every error to `{ error: { code, message, details? } }`. */
export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  if (res.headersSent) return;

  let status = 500;
  let body: ErrorBody = { code: "INTERNAL_ERROR", message: "Something went wrong" };

  if (err instanceof ZodError) {
    status = 400;
    body = {
      code: "VALIDATION_ERROR",
      message: "Request is invalid",
      details: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    };
  } else if (err instanceof ProjectNotFoundError) {
    status = 404;
    body = { code: "PROJECT_NOT_FOUND", message: err.message };
  } else if (err instanceof TaskNotFoundError) {
    status = 404;
    body = { code: "TASK_NOT_FOUND", message: err.message };
  } else if (err?.type === "entity.parse.failed") {
    status = 400;
    body = { code: "INVALID_JSON", message: "Request body is not valid JSON" };
  } else {
    console.error(`[${req.method} ${req.originalUrl}]`, err);
  }

  res.status(status).json({ error: body });
};

export const notFoundHandler: RequestHandler = (req, res) => {
  res.status(404).json({ error: { code: "ROUTE_NOT_FOUND", message: `Cannot ${req.method} ${req.path}` } });
};
