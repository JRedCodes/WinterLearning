import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import type pg from "pg";
import type { Redis } from "ioredis";
import { createApp } from "../src/app.js";
import { RedisCache } from "../src/cache/cache.js";
import { CacheMetrics } from "../src/cache/cacheMetrics.js";
import { PgProductRepository } from "../src/repositories/pgProductRepository.js";
import { CachedProductRepository } from "../src/repositories/cachedProductRepository.js";
import { ProductService } from "../src/services/productService.js";
import { createTestPool, resetDatabase } from "./helpers/db.js";
import { connectTestRedis, flushModuleKeys } from "./helpers/redis.js";

/**
 * Full stack: HTTP -> service -> cached repository -> real Redis + real
 * Postgres (with a simulated 40ms query). We count database reads by spying
 * on the Postgres repository.
 */
let pool: pg.Pool;
let redis: Redis;

beforeAll(async () => {
  pool = createTestPool();
  redis = await connectTestRedis();
});
afterAll(async () => {
  await flushModuleKeys(redis);
  await redis.quit();
  await pool.end();
});

function build() {
  const pgRepo = new PgProductRepository(pool, { queryDelayMs: 40 });
  const dbReads = vi.spyOn(pgRepo, "findById");
  const metrics = new CacheMetrics();
  const cached = new CachedProductRepository(pgRepo, new RedisCache(redis), metrics, {
    ttlSeconds: 300,
    jitterRatio: 0.1,
    negativeTtlSeconds: 30,
  });
  const app = createApp({ productService: new ProductService(cached), cacheMetrics: metrics });
  return { app, dbReads };
}

let ctx: ReturnType<typeof build>;
beforeEach(async () => {
  await resetDatabase(pool);
  await flushModuleKeys(redis);
  ctx = build();
});

describe("GET /products/:id through the cache", () => {
  it("returns the product and only queries Postgres once for repeated reads", async () => {
    const first = await request(ctx.app).get("/products/1");
    expect(first.status).toBe(200);
    expect(first.body.data).toMatchObject({ id: "1", sku: "DESK-OAK-120", priceCents: 54900 });
    const second = await request(ctx.app).get("/products/1");
    expect(second.status).toBe(200);
    expect(second.body).toEqual(first.body);
    expect(ctx.dbReads).toHaveBeenCalledTimes(1);
  });

  it("404s for a missing product and caches that answer", async () => {
    const a = await request(ctx.app).get("/products/999");
    const b = await request(ctx.app).get("/products/999");
    expect(a.status).toBe(404);
    expect(b.status).toBe(404);
    expect(b.body.error.code).toBe("NOT_FOUND");
    expect(ctx.dbReads).toHaveBeenCalledTimes(1);
  });

  it("50 concurrent requests for a cold product make one Postgres query", async () => {
    const responses = await Promise.all(Array.from({ length: 50 }, () => request(ctx.app).get("/products/2")));
    expect(responses.every((r) => r.status === 200)).toBe(true);
    expect(ctx.dbReads).toHaveBeenCalledTimes(1);
  });
});

describe("PATCH /products/:id invalidates the cache", () => {
  it("the next GET sees the change", async () => {
    await request(ctx.app).get("/products/3").expect(200);
    const patched = await request(ctx.app).patch("/products/3").send({ priceCents: 3900, stock: 99 });
    expect(patched.status).toBe(200);
    expect(patched.body.data).toMatchObject({ priceCents: 3900, stock: 99 });
    const after = await request(ctx.app).get("/products/3");
    expect(after.body.data).toMatchObject({ priceCents: 3900, stock: 99 });
  });

  it("validates the body", async () => {
    const res = await request(ctx.app).patch("/products/3").send({ priceCents: -5 });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });
});

describe("GET /metrics/cache (TODO 7b)", () => {
  it("exposes hit/miss counters and the hit ratio", async () => {
    await request(ctx.app).get("/products/1");
    await request(ctx.app).get("/products/1");
    await request(ctx.app).get("/products/1");
    await request(ctx.app).get("/products/1");
    const res = await request(ctx.app).get("/metrics/cache");
    expect(res.status).toBe(200);
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(res.body).toEqual({ hits: 3, misses: 1, coalesced: 0, errors: 0, hitRatio: 0.75 });
  });
});
