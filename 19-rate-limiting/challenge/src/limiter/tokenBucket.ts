import type { Redis } from "ioredis";
import { systemClock, type Clock } from "../lib/clock.js";
// import { LuaScript, toIntegers } from "../lib/script.js";
import { DEFAULT_PREFIX, type RateLimitDecision, type RateLimiter, type TokenBucketOptions } from "./types.js";

/**
 * TODO(3): Token bucket.
 *
 * State per key: { tokens, ts } in a hash at `${prefix}tb:${key}`.
 * A brand-new key starts FULL (tokens = capacity).
 * There's no timer refilling buckets: on each call, compute
 *   tokens = min(capacity, tokens + elapsedMs * refillPerMs)
 * then try to take `cost` tokens.
 *
 * - remaining    = whole tokens left (floor)
 * - retryAfterMs = when rejected: ceil(tokensStillNeeded / refillPerMs)
 * - resetMs      = ceil((capacity - tokens) / refillPerMs)  (time until full)
 * - limit        = capacity
 *
 * Requirements (see test/tokenBucket.test.ts):
 * - Burst up to capacity, then a steady refill rate; never above capacity.
 * - Atomic (one Lua script), rejected requests don't take tokens,
 *   key expires once it would be full anyway, uses this.clock().
 *
 * ⚠️ Lua gotcha: Redis TRUNCATES Lua floats to integers in replies, and every
 * ARGV is a string. Store the fractional token count with tostring(), and
 * return whole numbers (math.floor / math.ceil) from the script.
 */
export class TokenBucketLimiter implements RateLimiter {
  private readonly redis: Redis;
  private readonly prefix: string;
  private readonly clock: Clock;
  private readonly capacity: number;
  private readonly refillPerSecond: number;

  constructor(opts: TokenBucketOptions) {
    if (opts.capacity < 1 || opts.refillPerSecond <= 0) {
      throw new RangeError("capacity must be >= 1 and refillPerSecond > 0");
    }
    this.redis = opts.redis;
    this.prefix = opts.prefix ?? DEFAULT_PREFIX;
    this.clock = opts.clock ?? systemClock;
    this.capacity = opts.capacity;
    this.refillPerSecond = opts.refillPerSecond;
  }

  async consume(key: string, cost = 1): Promise<RateLimitDecision> {
    void [this.redis, this.prefix, this.clock, this.capacity, this.refillPerSecond, key, cost];
    throw new Error("Not implemented: TokenBucketLimiter.consume (TODO 3)");
  }
}
