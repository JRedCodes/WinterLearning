import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import type { Redis } from "ioredis";
import { createApp } from "../src/app.js";
import { FixedWindowLimiter } from "../src/limiter/fixedWindow.js";
import { TokenBucketLimiter } from "../src/limiter/tokenBucket.js";
import type { RateLimiter } from "../src/limiter/types.js";
import { connectRedis } from "../src/lib/redis.js";
import { deadRedis, deletePrefix, REDIS_URL, testRedis, uniquePrefix } from "./helpers/redis.js";

const quiet = () => {};

function limitersOn(redis: Redis, prefix: string, apiLimit = 3) {
  return {
    apiLimiter: new FixedWindowLimiter({ redis, prefix: `${prefix}api:`, limit: apiLimit, windowMs: 60_000 }),
    loginLimiter: new TokenBucketLimiter({ redis, prefix: `${prefix}login:`, capacity: 2, refillPerSecond: 0.01 }),
  };
}

describe("the demo app with real Redis-backed limiters", () => {
  let redis: Redis;
  let prefix: string;

  beforeAll(async () => {
    redis = await testRedis();
  });
  afterAll(() => redis.disconnect());
  beforeEach(() => {
    prefix = uniquePrefix();
  });
  afterEach(() => deletePrefix(redis, prefix));

  it("limits /api per caller and returns 429 with headers once exhausted", async () => {
    const app = createApp({ ...limitersOn(redis, prefix), onLimiterError: quiet });
    const statuses = [];
    for (let i = 0; i < 4; i++) {
      const res = await request(app).get("/api/quotes").set("x-api-key", "k1");
      statuses.push(res.status);
      if (i === 0) {
        expect(res.headers["ratelimit-limit"]).toBe("3");
        expect(res.headers["ratelimit-remaining"]).toBe("2");
      }
      if (i === 3) {
        expect(res.headers["retry-after"]).toMatch(/^\d+$/);
        expect(res.body.error.code).toBe("RATE_LIMITED");
      }
    }
    expect(statuses).toEqual([200, 200, 200, 429]);
  });

  it("gives each API key its own quota", async () => {
    const app = createApp({ ...limitersOn(redis, prefix, 1), onLimiterError: quiet });
    expect((await request(app).get("/api/quotes").set("x-api-key", "k1")).status).toBe(200);
    expect((await request(app).get("/api/quotes").set("x-api-key", "k2")).status).toBe(200);
    expect((await request(app).get("/api/quotes").set("x-api-key", "k1")).status).toBe(429);
  });

  it("does not rate limit /health", async () => {
    const app = createApp({ ...limitersOn(redis, prefix, 1), onLimiterError: quiet });
    for (let i = 0; i < 5; i++) expect((await request(app).get("/health")).status).toBe(200);
  });

  it("limits login attempts even when the password is right", async () => {
    const app = createApp({ ...limitersOn(redis, prefix), onLimiterError: quiet });
    const attempt = (password: string) => request(app).post("/auth/login").send({ username: "ada", password });
    expect((await attempt("wrong")).status).toBe(401);
    expect((await attempt("wrong")).status).toBe(401);
    expect((await attempt("lovelace")).status).toBe(429);
  });

  it("shares limits across two app instances (two processes, one Redis)", async () => {
    const redisB = await connectRedis(REDIS_URL);
    try {
      const appA = createApp({ ...limitersOn(redis, prefix, 10), onLimiterError: quiet });
      const appB = createApp({ ...limitersOn(redisB, prefix, 10), onLimiterError: quiet });
      const responses = await Promise.all(
        Array.from({ length: 50 }, (_, i) =>
          request(i % 2 === 0 ? appA : appB)
            .get("/api/quotes")
            .set("x-api-key", "shared"),
        ),
      );
      const ok = responses.filter((r) => r.status === 200).length;
      expect(ok, "50 parallel requests split across two instances, limit 10").toBe(10);
      expect(responses.filter((r) => r.status === 429)).toHaveLength(40);
    } finally {
      redisB.disconnect();
    }
  });

  it("when Redis is down: /api fails open, /auth/login fails closed", async () => {
    const dead = deadRedis();
    const errors: unknown[] = [];
    const limiters: { apiLimiter: RateLimiter; loginLimiter: RateLimiter } = limitersOn(dead, prefix);
    const app = createApp({ ...limiters, onLimiterError: (err) => errors.push(err) });

    const api = await request(app).get("/api/quotes");
    expect(api.status, "/api should keep serving without Redis").toBe(200);

    const login = await request(app).post("/auth/login").send({ username: "ada", password: "lovelace" });
    expect(login.status, "/auth/login must not allow unlimited guessing").toBe(503);
    expect(errors).toHaveLength(2);
    dead.disconnect();
  });
});
