import type { RequestHandler } from "express";
import type { IdempotencyStore } from "../repositories/idempotencyStore.js";

export const IDEMPOTENCY_HEADER = "Idempotency-Key";

/**
 * TODO(6): Idempotency-Key support for POST (see the IETF
 * "The Idempotency-Key HTTP Header Field" draft, and how Stripe does it).
 *
 * The client generates a unique key (usually a UUID) per logical operation and
 * sends the same key on every retry. We must make retries safe:
 *
 *   1. No header -> next() (the request is simply not idempotent).
 *      Header present but empty or longer than 255 chars -> ValidationError
 *      (pointer "/Idempotency-Key").
 *   2. Scope the key to the operation: `${req.method} ${req.originalUrl} ${key}`
 *      (the same key on a different endpoint is a different operation).
 *   3. Fingerprint the request: sha256 hex digest of JSON.stringify(req.body ?? null).
 *   4. Look the scoped key up in the store:
 *      - completed + same fingerprint  -> REPLAY: send the stored status, the
 *        stored headers, the stored body, plus header `Idempotent-Replayed: true`.
 *        Do NOT call next(): the handler must not run again.
 *      - any record + different fingerprint -> IdempotencyKeyReusedError (422)
 *      - in_progress + same fingerprint -> IdempotencyKeyInFlightError (409)
 *      - nothing -> store.begin(scopedKey, fingerprint). If begin() returns false,
 *        another request claimed the key a moment ago: treat as in flight (409).
 *   5. For a fresh request, capture the response so it can be replayed:
 *      wrap res.json to remember the body, and on res "finish":
 *        status < 500  -> store.complete(scopedKey, { status, headers: {Location, ETag
 *                         if present}, body })
 *        status >= 500 -> store.release(scopedKey) so the client may retry
 *      then call next().
 *
 * Throwing from this middleware is fine: Express 5 forwards it to the error handler.
 */
export function idempotency(_store: IdempotencyStore): RequestHandler {
  // Placeholder: ignores the header entirely, so retries create duplicates. Replace it.
  return (_req, _res, next) => {
    next();
  };
}
