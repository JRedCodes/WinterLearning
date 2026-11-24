import type { Redis } from "ioredis";
import { systemClock, type Clock } from "../lib/clock.js";
// You'll want these two for your Lua script:
// import { LuaScript, toIntegers } from "../lib/script.js";
import { DEFAULT_PREFIX, type RateLimitDecision, type RateLimiter, type WindowLimiterOptions } from "./types.js";

/**
 * TODO(1): Fixed window counter.
 *
 * One counter per key per window. With windowMs = 60_000, all requests between
 * 12:00:00.000 and 12:00:59.999 share one counter.
 *
 * - window number  = Math.floor(now / windowMs)
 * - Redis key      = `${prefix}fw:${key}:${window}`
 * - resetMs        = time until the window ends
 * - retryAfterMs   = resetMs when rejected, 0 when allowed
 * - remaining      = limit - count (never negative)
 *
 * Requirements (see test/fixedWindow.test.ts):
 * - Atomic: write ONE Lua script that reads the counter, decides, and only
 *   then increments. 50 concurrent consume() calls → exactly `limit` allowed.
 *   (A JS "GET, compare, INCR" sequence is a race. Try it and watch the test fail.)
 * - A rejected request must NOT increment the counter.
 * - The key must expire on its own (PEXPIRE) so Redis doesn't fill up with
 *   dead windows.
 * - Use this.clock(), never Date.now() directly, so tests control time.
 */
export class FixedWindowLimiter implements RateLimiter {
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
    throw new Error("Not implemented: FixedWindowLimiter.consume (TODO 1)");
  }
}
