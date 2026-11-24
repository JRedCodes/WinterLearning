import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Redis } from "ioredis";
import { FixedWindowLimiter } from "../src/limiter/fixedWindow.js";
import { deletePrefix, fakeClock, keysUnder, testRedis, uniquePrefix } from "./helpers/redis.js";

describe("FixedWindowLimiter (TODO 1)", () => {
  let redis: Redis;
  let prefix: string;
  let clock: ReturnType<typeof fakeClock>;

  beforeAll(async () => {
    redis = await testRedis();
  });
  afterAll(() => redis.disconnect());
  beforeEach(() => {
    prefix = uniquePrefix();
    // 1_700_000_000_000 is a multiple of 1000, so windows start at clock.now.
    clock = fakeClock();
  });
  afterEach(() => deletePrefix(redis, prefix));

  const make = (limit: number, windowMs: number) =>
    new FixedWindowLimiter({ redis, prefix, clock: clock.fn, limit, windowMs });

  it("allows `limit` requests, then rejects, counting `remaining` down", async () => {
    const limiter = make(3, 1000);
    const results = [];
    for (let i = 0; i < 4; i++) results.push(await limiter.consume("alice"));

    expect(results.map((r) => r.allowed)).toEqual([true, true, true, false]);
    expect(results.map((r) => r.remaining)).toEqual([2, 1, 0, 0]);
    expect(results.every((r) => r.limit === 3)).toBe(true);
  });

  it("reports resetMs as the time left in the current window", async () => {
    const limiter = make(2, 1000);
    clock.advance(250); // 250ms into a window
    const first = await limiter.consume("alice");
    expect(first.resetMs).toBe(750);
    expect(first.retryAfterMs).toBe(0);

    await limiter.consume("alice");
    clock.advance(500);
    const rejected = await limiter.consume("alice");
    expect(rejected.allowed).toBe(false);
    expect(rejected.resetMs).toBe(250);
    expect(rejected.retryAfterMs, "rejected → retry when the window ends").toBe(250);
  });

  it("starts a fresh count in the next window", async () => {
    const limiter = make(2, 1000);
    await limiter.consume("alice");
    await limiter.consume("alice");
    expect((await limiter.consume("alice")).allowed).toBe(false);

    clock.advance(1000);
    const next = await limiter.consume("alice");
    expect(next.allowed).toBe(true);
    expect(next.remaining).toBe(1);
  });

  it("keeps separate counters per key", async () => {
    const limiter = make(1, 1000);
    expect((await limiter.consume("alice")).allowed).toBe(true);
    expect((await limiter.consume("bob")).allowed).toBe(true);
    expect((await limiter.consume("alice")).allowed).toBe(false);
  });

  it("supports cost, and a rejected request does not use up capacity", async () => {
    const limiter = make(5, 1000);
    const a = await limiter.consume("alice", 3);
    expect(a).toMatchObject({ allowed: true, remaining: 2 });

    const b = await limiter.consume("alice", 3);
    expect(b.allowed, "3 + 3 > 5 must be rejected").toBe(false);
    expect(b.remaining).toBe(2);

    const c = await limiter.consume("alice", 2);
    expect(c.allowed, "the rejected cost-3 request must not have been counted").toBe(true);
    expect(c.remaining).toBe(0);
  });

  it("stores its keys under the prefix and lets them expire", async () => {
    const limiter = make(5, 1000);
    await limiter.consume("alice");
    const keys = await keysUnder(redis, prefix);
    expect(keys.length, `expected one key under ${prefix}`).toBe(1);
    const ttl = await redis.pttl(keys[0]!);
    expect(ttl, "the window key needs a TTL (PEXPIRE) so it cleans itself up").toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(1000);
  });

  it("is atomic: 50 concurrent requests with limit 10 → exactly 10 allowed", async () => {
    const limiter = make(10, 60_000);
    const results = await Promise.all(Array.from({ length: 50 }, () => limiter.consume("burst")));
    expect(results.filter((r) => r.allowed)).toHaveLength(10);
  });
});
