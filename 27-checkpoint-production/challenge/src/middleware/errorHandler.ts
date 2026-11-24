import type { ErrorRequestHandler } from "express";
import { NoteNotFoundError } from "../domain/note.js";

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof NoteNotFoundError) {
    res.status(404).json({ error: { code: "NOT_FOUND", message: err.message } });
    return;
  }
  console.log("error", err);
  res.status(err.status ?? 500).json({ error: err.message, stack: err.stack });
};
