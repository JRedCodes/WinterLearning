import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Redis } from "ioredis";
import { RedisIdempotencyStore } from "../src/jobs/idempotency.js";
import { deletePrefix, testRedis } from "./helpers/redis.js";

describe("RedisIdempotencyStore (TODO 4)", () => {
  let redis: Redis;
  let prefix: string;
  let store: RedisIdempotencyStore;

  beforeAll(async () => {
    redis = await testRedis();
  });
  afterAll(() => redis.disconnect());
  beforeEach(() => {
    prefix = `wl:20:test:${randomUUID().slice(0, 8)}:idem:`;
    store = new RedisIdempotencyStore(redis, prefix);
  });
  afterEach(() => deletePrefix(redis, prefix));

  it("the first claim is acquired; a second one while in progress is busy", async () => {
    expect(await store.claim("job-1", 10_000)).toBe("acquired");
    expect(await store.claim("job-1", 10_000)).toBe("busy");
    expect(await store.claim("job-2", 10_000), "keys are independent").toBe("acquired");
  });

  it("only one of many concurrent claims wins", async () => {
    const results = await Promise.all(Array.from({ length: 20 }, () => store.claim("race", 10_000)));
    expect(results.filter((r) => r === "acquired")).toHaveLength(1);
    expect(results.filter((r) => r === "busy")).toHaveLength(19);
  });

  it("after complete(), claims answer done", async () => {
    await store.claim("job-1", 10_000);
    await store.complete("job-1", 60_000);
    expect(await store.claim("job-1", 10_000)).toBe("done");
  });

  it("release() frees an in-progress claim so a retry can acquire it", async () => {
    await store.claim("job-1", 10_000);
    await store.release("job-1");
    expect(await store.claim("job-1", 10_000)).toBe("acquired");
  });

  it("release() never erases a done marker", async () => {
    await store.claim("job-1", 10_000);
    await store.complete("job-1", 60_000);
    await store.release("job-1");
    expect(await store.claim("job-1", 10_000)).toBe("done");
  });

  it("a claim expires after its lease (a crashed worker doesn't block forever)", async () => {
    expect(await store.claim("job-1", 50)).toBe("acquired");
    await new Promise((r) => setTimeout(r, 120));
    expect(await store.claim("job-1", 10_000)).toBe("acquired");
  });

  it("stores keys under the prefix, always with a TTL", async () => {
    await store.claim("a", 10_000);
    await store.claim("b", 10_000);
    await store.complete("b", 60_000);
    const ttlA = await redis.pttl(`${prefix}a`);
    const ttlB = await redis.pttl(`${prefix}b`);
    expect(ttlA).toBeGreaterThan(0);
    expect(ttlA).toBeLessThanOrEqual(10_000);
    expect(ttlB, "done markers need a TTL too").toBeGreaterThan(10_000);
  });
});
