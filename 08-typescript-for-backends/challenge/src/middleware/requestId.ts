import { randomUUID } from "node:crypto";
import type { RequestHandler } from "express";

const VALID_ID = /^[A-Za-z0-9_-]{1,128}$/;

export function requestId(): RequestHandler {
  return (req, res, next) => {
    const incoming = req.get("x-request-id");
    const id = incoming && VALID_ID.test(incoming) ? incoming : randomUUID();
    res.locals.requestId = id;
    res.setHeader("X-Request-Id", id);
    next();
  };
}
