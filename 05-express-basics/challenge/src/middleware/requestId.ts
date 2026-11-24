import type { RequestHandler } from "express";

/**
 * TODO(1): Request IDs
 *
 * Give every request an id so a log line can be traced back to a response.
 *  - If the client sent an `X-Request-Id` header that is 1–128 characters of
 *    [A-Za-z0-9_-], reuse it. Otherwise generate one with crypto.randomUUID().
 *  - Store it on `res.locals.requestId` (later middleware reads it there).
 *  - Set the `X-Request-Id` response header.
 *  - Pass control to the next middleware.
 */
export function requestId(): RequestHandler {
  return (_req, _res, next) => {
    next();
  };
}
