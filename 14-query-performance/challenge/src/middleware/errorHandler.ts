import type { ErrorRequestHandler, RequestHandler } from "express";
import { ZodError } from "zod";
import { InvalidCursorError, PostNotFoundError, UserNotFoundError } from "../domain/errors.js";

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  if (res.headersSent) return;
  if (err instanceof ZodError) {
    res.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "Request is invalid",
        details: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      },
    });
  } else if (err instanceof InvalidCursorError) {
    res.status(400).json({ error: { code: "INVALID_CURSOR", message: err.message } });
  } else if (err instanceof UserNotFoundError) {
    res.status(404).json({ error: { code: "USER_NOT_FOUND", message: err.message } });
  } else if (err instanceof PostNotFoundError) {
    res.status(404).json({ error: { code: "POST_NOT_FOUND", message: err.message } });
  } else {
    console.error(`[${req.method} ${req.originalUrl}]`, err);
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Something went wrong" } });
  }
};

export const notFoundHandler: RequestHandler = (req, res) => {
  res.status(404).json({ error: { code: "ROUTE_NOT_FOUND", message: `Cannot ${req.method} ${req.path}` } });
};
