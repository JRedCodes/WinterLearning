import { timingSafeEqual } from "node:crypto";
import type { RequestHandler } from "express";
import { UnauthorizedError } from "../domain/errors.js";

/**
 * Protects write routes with a shared secret in the X-Api-Key header.
 * If no key is configured (local dev, tests) the check is skipped; config.ts
 * makes sure production can't start without one.
 * (Real authentication is module 22.)
 */
export function requireApiKey(apiKey: string | undefined): RequestHandler {
  return (req, _res, next) => {
    if (apiKey === undefined) return next();
    const given = Buffer.from(req.get("x-api-key") ?? "");
    const expected = Buffer.from(apiKey);
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
      return next(new UnauthorizedError());
    }
    next();
  };
}
