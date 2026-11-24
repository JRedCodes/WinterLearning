import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Redis } from "ioredis";
import { TokenBucketLimiter } from "../src/limiter/tokenBucket.js";
import { deletePrefix, fakeClock, keysUnder, testRedis, uniquePrefix } from "./helpers/redis.js";

describe("TokenBucketLimiter (TODO 3)", () => {
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

  const make = (capacity: number, refillPerSecond: number) =>
    new TokenBucketLimiter({ redis, prefix, clock: clock.fn, capacity, refillPerSecond });

  it("starts full: allows a burst of `capacity`, then rejects", async () => {
    const limiter = make(4, 1);
    const results = [];
    for (let i = 0; i < 5; i++) results.push(await limiter.consume("alice"));
    expect(results.map((r) => r.allowed)).toEqual([true, true, true, true, false]);
    expect(results.map((r) => r.remaining)).toEqual([3, 2, 1, 0, 0]);
    expect(results[0]!.limit).toBe(4);
  });

  it("refills at refillPerSecond and tells you when to retry", async () => {
    const limiter = make(2, 2); // one token every 500ms
    await limiter.consume("alice");
    await limiter.consume("alice");

    const rejected = await limiter.consume("alice");
    expect(rejected.allowed).toBe(false);
    expect(rejected.retryAfterMs, "1 token at 2/s takes 500ms").toBe(500);

    clock.advance(499);
    expect((await limiter.consume("alice")).allowed, "not quite a whole token yet").toBe(false);

    clock.advance(1);
    const ok = await limiter.consume("alice");
    expect(ok.allowed).toBe(true);
    expect(ok.retryAfterMs).toBe(0);
  });

  it("keeps fractional tokens between calls (Lua float pitfall)", async () => {
    const limiter = make(1, 1); // 1 token per second
    await limiter.consume("alice"); // empty at t=0
    clock.advance(300);
    expect((await limiter.consume("alice")).allowed).toBe(false); // 0.3 tokens
    clock.advance(300);
    expect((await limiter.consume("alice")).allowed).toBe(false); // 0.6 tokens
    clock.advance(400);
    expect(
      (await limiter.consume("alice")).allowed,
      "0.3 + 0.3 + 0.4 = 1 token: if fractions were truncated to 0 each call this would fail",
    ).toBe(true);
  });

  it("never fills above capacity after a long idle period", async () => {
    const limiter = make(3, 10);
    await limiter.consume("alice");
    clock.advance(60 * 60 * 1000); // an hour later
    const results = [];
    for (let i = 0; i < 4; i++) results.push((await limiter.consume("alice")).allowed);
    expect(results).toEqual([true, true, true, false]);
  });

  it("reports resetMs as the time until the bucket is full again", async () => {
    const limiter = make(4, 2); // 500ms per token
    const r = await limiter.consume("alice", 2);
    expect(r.remaining).toBe(2);
    expect(r.resetMs).toBe(1000);
  });

  it("supports cost, and a rejected request takes no tokens", async () => {
    const limiter = make(5, 1);
    expect((await limiter.consume("alice", 3)).allowed).toBe(true);
    const b = await limiter.consume("alice", 3);
    expect(b.allowed).toBe(false);
    expect(b.retryAfterMs, "needs 1 more token at 1/s").toBe(1000);
    const c = await limiter.consume("alice", 2);
    expect(c.allowed, "the rejected request must not have taken tokens").toBe(true);
    expect(c.remaining).toBe(0);
  });

  it("keeps one key per identity, under the prefix, with a TTL", async () => {
    const limiter = make(10, 1);
    await limiter.consume("alice");
    await limiter.consume("bob");
    const keys = await keysUnder(redis, prefix);
    expect(keys).toHaveLength(2);
    for (const k of keys) {
      expect(await redis.pttl(k), `${k} needs a TTL`).toBeGreaterThan(0);
    }
  });

  it("is atomic: 50 concurrent requests on a bucket of 10 → exactly 10 allowed", async () => {
    const limiter = make(10, 0.001);
    const results = await Promise.all(Array.from({ length: 50 }, () => limiter.consume("burst")));
    expect(results.filter((r) => r.allowed)).toHaveLength(10);
  });
});
