import type { Redis } from "ioredis";
import type { Clock } from "../lib/clock.js";

/**
 * The answer a limiter gives for one request.
 *
 * All durations are in MILLISECONDS here; the HTTP middleware converts them to
 * the whole seconds that headers use.
 */
export interface RateLimitDecision {
  /** Was this request allowed? */
  allowed: boolean;
  /** The configured maximum (requests per window, or bucket capacity). */
  limit: number;
  /** Whole units still available AFTER this decision (never negative). */
  remaining: number;
  /** ms until the limiter is back to FULL capacity for this key. */
  resetMs: number;
  /** 0 when allowed; otherwise ms until a request of the same cost would be allowed. */
  retryAfterMs: number;
}

/**
 * Every algorithm hides behind this interface, so the middleware (and the
 * rest of the app) never knows or cares which one it's talking to.
 *
 * Contract shared by all implementations:
 * - `consume` is ATOMIC: 50 concurrent calls on a fresh key with limit 10
 *   allow exactly 10, even across processes sharing the same Redis.
 * - A REJECTED request does not use up any capacity.
 * - `cost` defaults to 1 (an expensive endpoint may cost more).
 * - If Redis fails, `consume` rejects (throws). Deciding what to do about
 *   that (fail open / fail closed) is the middleware's job, not the limiter's.
 */
export interface RateLimiter {
  consume(key: string, cost?: number): Promise<RateLimitDecision>;
}

/** Options shared by the Redis-backed limiters. */
export interface RedisLimiterOptions {
  redis: Redis;
  /** Prepended to every Redis key. Default "wl:19:rl:". */
  prefix?: string;
  /** Source of "now". Default Date.now. Passed into Lua as an argument. */
  clock?: Clock;
}

export interface WindowLimiterOptions extends RedisLimiterOptions {
  /** Max requests per window. */
  limit: number;
  /** Window length in ms. */
  windowMs: number;
}

export interface TokenBucketOptions extends RedisLimiterOptions {
  /** Max tokens the bucket holds (= the largest allowed burst). */
  capacity: number;
  /** Tokens added per second (may be fractional, e.g. 0.5). */
  refillPerSecond: number;
}

export const DEFAULT_PREFIX = "wl:19:rl:";
