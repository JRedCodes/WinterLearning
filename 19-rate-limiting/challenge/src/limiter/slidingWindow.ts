import type { Redis } from "ioredis";
import { systemClock, type Clock } from "../lib/clock.js";
// import { randomUUID } from "node:crypto";
// import { LuaScript, toIntegers } from "../lib/script.js";
import { DEFAULT_PREFIX, type RateLimitDecision, type RateLimiter, type WindowLimiterOptions } from "./types.js";

/**
 * TODO(2): Sliding window LOG (exact) using a sorted set.
 *
 * Every allowed request is stored as a member with score = its timestamp.
 * "How many requests in the last windowMs?" = drop old members, then count.
 *
 * - Redis key: `${prefix}sw:${key}`
 * - An entry with score <= now - windowMs is OUTSIDE the window.
 * - Members must be unique even when two requests share a timestamp
 *   (pass a randomUUID() into the script; use `${id}:${i}` for cost > 1).
 * - When rejected, retryAfterMs is how long until enough entries slide out:
 *   for cost 1 that's (oldest score + windowMs - now).
 * - resetMs = time until the newest entry slides out (window empty again).
 *
 * Requirements (see test/slidingWindow.test.ts):
 * - No boundary burst: 5 requests at t=900 with limit 5 / window 1000 means a
 *   request at t=1000 is still rejected (a fixed window would allow it).
 * - Atomic, rejected requests don't count, key expires, uses this.clock().
 *
 * Useful commands: ZREMRANGEBYSCORE, ZCARD, ZRANGE ... WITHSCORES, ZADD, PEXPIRE.
 */
export class SlidingWindowLimiter implements RateLimiter {
  private readonly redis: Redis;
  private readonly prefix: string;
  private readonly clock: Clock;
  private readonly limit: number;
  private readonly windowMs: number;

  constructor(opts: WindowLimiterOptions) {
    if (opts.limit < 1 || opts.windowMs < 1) throw new RangeError("limit and windowMs must be >= 1");
    this.redis = opts.redis;
    this.prefix = opts.prefix ?? DEFAULT_PREFIX;
    this.clock = opts.clock ?? systemClock;
    this.limit = opts.limit;
    this.windowMs = opts.windowMs;
  }

  async consume(key: string, cost = 1): Promise<RateLimitDecision> {
    void [this.redis, this.prefix, this.clock, this.limit, this.windowMs, key, cost];
    throw new Error("Not implemented: SlidingWindowLimiter.consume (TODO 2)");
  }
}
