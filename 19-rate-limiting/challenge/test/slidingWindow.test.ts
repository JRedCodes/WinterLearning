import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Redis } from "ioredis";
import { SlidingWindowLimiter } from "../src/limiter/slidingWindow.js";
import { deletePrefix, fakeClock, keysUnder, testRedis, uniquePrefix } from "./helpers/redis.js";

describe("SlidingWindowLimiter (TODO 2)", () => {
  let redis: Redis;
  let prefix: string;
  let clock: ReturnType<typeof fakeClock>;

  beforeAll(async () => {
    redis = await testRedis();
  });
  afterAll(() => redis.disconnect());
  beforeEach(() => {
    prefix = uniquePrefix();
    clock = fakeClock();
  });
  afterEach(() => deletePrefix(redis, prefix));

  const make = (limit: number, windowMs: number) =>
    new SlidingWindowLimiter({ redis, prefix, clock: clock.fn, limit, windowMs });

  it("allows `limit` requests, then rejects", async () => {
    const limiter = make(3, 1000);
    const results = [];
    for (let i = 0; i < 4; i++) results.push(await limiter.consume("alice"));
    expect(results.map((r) => r.allowed)).toEqual([true, true, true, false]);
    expect(results.map((r) => r.remaining)).toEqual([2, 1, 0, 0]);
    expect(results[0]!.limit).toBe(3);
  });

  it("has no boundary burst (unlike a fixed window)", async () => {
    const limiter = make(5, 1000);
    clock.advance(900);
    for (let i = 0; i < 5; i++) expect((await limiter.consume("alice")).allowed).toBe(true);

    clock.advance(100); // t = 1000: a fixed window would have reset here
    const r = await limiter.consume("alice");
    expect(r.allowed, "the 5 requests at t=900 are still inside the last 1000ms").toBe(false);
    expect(r.retryAfterMs, "oldest (900) + window (1000) - now (1000)").toBe(900);
  });

  it("frees capacity as old requests slide out of the window", async () => {
    const limiter = make(2, 1000);
    await limiter.consume("alice"); // t=0
    clock.advance(400);
    await limiter.consume("alice"); // t=400
    expect((await limiter.consume("alice")).allowed).toBe(false);

    clock.advance(599); // t=999: the t=0 entry is still inside (0 > 999 - 1000)
    expect((await limiter.consume("alice")).allowed).toBe(false);

    clock.advance(1); // t=1000: the t=0 entry has slid out
    const r = await limiter.consume("alice");
    expect(r.allowed).toBe(true);
    expect(r.remaining).toBe(0);
  });

  it("reports resetMs (until the window is empty) and retryAfterMs = 0 when allowed", async () => {
    const limiter = make(3, 1000);
    const r = await limiter.consume("alice");
    expect(r.retryAfterMs).toBe(0);
    expect(r.resetMs).toBe(1000);
  });

  it("supports cost, and a rejected request does not count", async () => {
    const limiter = make(5, 1000);
    expect((await limiter.consume("alice", 3)).allowed).toBe(true);
    expect((await limiter.consume("alice", 3)).allowed).toBe(false);
    const c = await limiter.consume("alice", 2);
    expect(c.allowed, "the rejected cost-3 request must not have been recorded").toBe(true);
    expect(c.remaining).toBe(0);
  });

  it("counts requests with the same timestamp separately", async () => {
    const limiter = make(3, 1000);
    // clock does not move: three requests share one timestamp
    await limiter.consume("alice");
    await limiter.consume("alice");
    const third = await limiter.consume("alice");
    expect(third.remaining, "sorted-set members must be unique per request").toBe(0);
  });

  it("keeps separate logs per key, under the prefix, with a TTL", async () => {
    const limiter = make(1, 1000);
    expect((await limiter.consume("alice")).allowed).toBe(true);
    expect((await limiter.consume("bob")).allowed).toBe(true);
    const keys = await keysUnder(redis, prefix);
    expect(keys).toHaveLength(2);
    for (const k of keys) {
      const ttl = await redis.pttl(k);
      expect(ttl, `${k} needs a TTL`).toBeGreaterThan(0);
      expect(ttl).toBeLessThanOrEqual(1000);
    }
  });

  it("is atomic: 50 concurrent requests with limit 10 → exactly 10 allowed", async () => {
    const limiter = make(10, 60_000);
    const results = await Promise.all(Array.from({ length: 50 }, () => limiter.consume("burst")));
    expect(results.filter((r) => r.allowed)).toHaveLength(10);
  });
});
