import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Redis } from "ioredis";
import { RedisCache, type Cache } from "../src/cache/cache.js";
import { CacheMetrics } from "../src/cache/cacheMetrics.js";
import {
  CachedProductRepository,
  productCacheKey,
  type CachedProductRepositoryOptions,
} from "../src/repositories/cachedProductRepository.js";
import { connectTestRedis, flushModuleKeys } from "./helpers/redis.js";
import { BrokenCache, FakeProductRepository, makeProduct, sleep } from "./helpers/fakes.js";

let redis: Redis;
beforeAll(async () => {
  redis = await connectTestRedis();
});
beforeEach(async () => {
  await flushModuleKeys(redis);
});
afterAll(async () => {
  await flushModuleKeys(redis);
  await redis.quit();
});

const OPTIONS: CachedProductRepositoryOptions = {
  ttlSeconds: 300,
  jitterRatio: 0.1,
  negativeTtlSeconds: 30,
  random: () => 0.5, // deterministic: TTL = exactly ttlSeconds
};

function setup(opts: Partial<CachedProductRepositoryOptions> = {}, cache?: Cache) {
  const db = new FakeProductRepository([makeProduct("1"), makeProduct("2", { priceCents: 2500 })]);
  const metrics = new CacheMetrics();
  const repo = new CachedProductRepository(db, cache ?? new RedisCache(redis), metrics, { ...OPTIONS, ...opts });
  return { db, metrics, repo };
}

describe("cache-aside reads (TODO 2)", () => {
  it("serves the second read from the cache without touching the database", async () => {
    const { db, repo } = setup();
    const first = await repo.findById("1");
    const second = await repo.findById("1");
    expect(first).toEqual(makeProduct("1"));
    expect(second, "cached value must round-trip to an identical object").toEqual(first);
    expect(db.findByIdCalls, "database was queried again on a cache hit").toBe(1);
  });

  it("stores the product as JSON under wl:18:product:v1:<id>", async () => {
    const { repo } = setup();
    await repo.findById("1");
    const raw = await redis.get(productCacheKey("1"));
    expect(raw, "nothing was written to Redis").not.toBeNull();
    expect(JSON.parse(raw!)).toEqual(makeProduct("1"));
  });

  it("caches each id under its own key", async () => {
    const { db, repo } = setup();
    expect((await repo.findById("1"))?.id).toBe("1");
    expect((await repo.findById("2"))?.priceCents).toBe(2500);
    await repo.findById("1");
    await repo.findById("2");
    expect(db.findByIdCalls).toBe(2);
  });

  it("sets a TTL with jitter applied", async () => {
    const low = setup({ random: () => 0 });
    await low.repo.findById("1");
    const ttl = await redis.ttl(productCacheKey("1"));
    expect(ttl, "TTL -1 means the entry never expires").toBeGreaterThan(260);
    expect(ttl, "random()=0 should give ttlSeconds * (1 - jitterRatio) = 270").toBeLessThanOrEqual(270);
  });

  it("records one miss then hits", async () => {
    const { metrics, repo } = setup();
    await repo.findById("1");
    await repo.findById("1");
    await repo.findById("1");
    expect(metrics.hits).toBe(2);
    expect(metrics.misses).toBe(1);
  });
});

describe("negative caching (TODO 3)", () => {
  it("caches 'not found' so repeated lookups of a missing id skip the database", async () => {
    const { db, metrics, repo } = setup();
    expect(await repo.findById("404")).toBeNull();
    expect(await repo.findById("404")).toBeNull();
    expect(await repo.findById("404")).toBeNull();
    expect(db.findByIdCalls, "missing ids should be cached too").toBe(1);
    expect(metrics.hits).toBe(2);
    expect(metrics.misses).toBe(1);
  });

  it("uses the shorter negative TTL", async () => {
    const { repo } = setup();
    await repo.findById("404");
    const ttl = await redis.ttl(productCacheKey("404"));
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(30);
  });
});

describe("invalidation on write (TODO 4)", () => {
  it("a read after an update returns the new data", async () => {
    const { db, repo } = setup();
    await repo.findById("1"); // now cached
    const updated = await repo.update("1", { priceCents: 999 });
    expect(updated?.priceCents).toBe(999);
    expect((await repo.findById("1"))?.priceCents, "stale cache entry served after update").toBe(999);
    expect(db.updateCalls).toBe(1);
  });

  it("deletes the cache entry instead of rewriting it", async () => {
    const { repo } = setup();
    await repo.findById("1");
    await repo.update("1", { name: "Renamed" });
    expect(await redis.exists(productCacheKey("1")), "entry should be deleted on update").toBe(0);
  });

  it("returns null for updates of missing products", async () => {
    const { repo } = setup();
    expect(await repo.update("404", { name: "x" })).toBeNull();
  });
});

describe("request coalescing / stampede protection (TODO 5)", () => {
  it("100 concurrent misses on one id cause exactly one database call", async () => {
    const { db, metrics, repo } = setup();
    const results = await Promise.all(Array.from({ length: 100 }, () => repo.findById("1")));
    expect(db.findByIdCalls, "cache stampede: every miss hit the database").toBe(1);
    for (const r of results) expect(r).toEqual(makeProduct("1"));
    expect(metrics.misses).toBe(100);
    expect(metrics.coalesced).toBe(99);
  });

  it("coalesces per id, not globally", async () => {
    const { db, repo } = setup();
    await Promise.all([...Array(10)].flatMap(() => [repo.findById("1"), repo.findById("2")]));
    expect(db.findByIdCalls).toBe(2);
  });

  it("coalesces missing ids too", async () => {
    const { db, repo } = setup();
    const results = await Promise.all(Array.from({ length: 20 }, () => repo.findById("404")));
    expect(results.every((r) => r === null)).toBe(true);
    expect(db.findByIdCalls).toBe(1);
  });

  it("a failed load rejects all waiters and is not remembered", async () => {
    const { db, repo } = setup();
    db.failNextFind = true;
    const results = await Promise.allSettled(Array.from({ length: 5 }, () => repo.findById("1")));
    expect(results.every((r) => r.status === "rejected")).toBe(true);
    expect(db.findByIdCalls).toBe(1);
    // The next call must try the database again, not reuse the rejected promise.
    expect(await repo.findById("1")).toEqual(makeProduct("1"));
    expect(db.findByIdCalls).toBe(2);
  });

  it("forgets the in-flight load once it settles", async () => {
    const { db, repo } = setup();
    await repo.findById("1");
    await redis.del(productCacheKey("1")); // evicted
    await sleep(5);
    await repo.findById("1");
    expect(db.findByIdCalls, "a settled load was reused instead of querying again").toBe(2);
  });
});

describe("fail open when the cache is down (TODO 6)", () => {
  it("reads still work, straight from the database, and errors are counted", async () => {
    const { db, metrics, repo } = setup({}, new BrokenCache());
    expect(await repo.findById("1")).toEqual(makeProduct("1"));
    expect(await repo.findById("404")).toBeNull();
    expect(db.findByIdCalls).toBe(2);
    expect(metrics.misses).toBe(2);
    expect(metrics.errors, "each failed get and set should be counted").toBeGreaterThanOrEqual(2);
  });

  it("updates still succeed when the cache delete fails", async () => {
    const { metrics, repo } = setup({}, new BrokenCache());
    expect((await repo.update("1", { stock: 1 }))?.stock).toBe(1);
    expect(metrics.errors).toBeGreaterThanOrEqual(1);
  });
});

describe("metrics snapshot (TODO 7a)", () => {
  it("reports counters and the hit ratio", async () => {
    const { metrics, repo } = setup();
    expect(metrics.snapshot()).toEqual({ hits: 0, misses: 0, coalesced: 0, errors: 0, hitRatio: 0 });
    await repo.findById("1");
    await repo.findById("1");
    await repo.findById("1");
    await repo.findById("1");
    expect(metrics.snapshot()).toEqual({ hits: 3, misses: 1, coalesced: 0, errors: 0, hitRatio: 0.75 });
  });
});
