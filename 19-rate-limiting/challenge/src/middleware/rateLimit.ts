import type { Request, RequestHandler } from "express";
// import { HttpError } from "../lib/httpError.js";
import type { RateLimiter } from "../limiter/types.js";

/** Turns a request into the identity we count against (API key, user, IP...). */
export type KeyFn = (req: Request) => string;

export type LimiterErrorHook = (err: unknown, req: Request) => void;

export interface RateLimitOptions {
  /** If the limiter throws: true = let the request through, false = 503. Default false. */
  failOpen?: boolean;
  /** Units this route consumes per request. Default 1. */
  cost?: number;
  /** Called whenever the limiter throws, in both modes. Default: console.warn. */
  onLimiterError?: LimiterErrorHook;
}

/**
 * TODO(4): Express middleware around any RateLimiter.
 *
 * For each request:
 * 1. key = keyFn(req); decision = await limiter.consume(key, cost)
 * 2. Always set (when the limiter answered):
 *      RateLimit-Limit:     decision.limit
 *      RateLimit-Remaining: decision.remaining
 *      RateLimit-Reset:     seconds until full reset, rounded UP
 * 3. Allowed → next().
 *    Rejected → set Retry-After (seconds, rounded UP, at least 1) and forward
 *    HttpError(429, "RATE_LIMITED", ...) to the error handler.
 * 4. If consume() throws: call onLimiterError(err, req), then
 *      failOpen  → next() (no RateLimit headers: we don't know them)
 *      otherwise → HttpError(503, "RATE_LIMITER_UNAVAILABLE", ...)
 *
 * Express 5 forwards a thrown error (or rejected promise) to errorHandler.
 */
export function rateLimit(limiter: RateLimiter, keyFn: KeyFn, options: RateLimitOptions = {}): RequestHandler {
  void [limiter, keyFn, options];
  return () => {
    throw new Error("Not implemented: rateLimit middleware (TODO 4)");
  };
}
