import type { RequestHandler } from "express";
import { HttpError } from "../lib/httpError.js";

export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(new HttpError(404, "ROUTE_NOT_FOUND", `Cannot ${req.method} ${req.path}`));
};
