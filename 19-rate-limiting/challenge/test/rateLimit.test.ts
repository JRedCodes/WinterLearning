import { describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
import { rateLimit, type RateLimitOptions } from "../src/middleware/rateLimit.js";
import { errorHandler } from "../src/middleware/errorHandler.js";
import type { RateLimitDecision, RateLimiter } from "../src/limiter/types.js";

/** A limiter that returns whatever decision we script, and records its calls. */
class ScriptedLimiter implements RateLimiter {
  calls: Array<{ key: string; cost: number | undefined }> = [];
  constructor(private readonly next: () => RateLimitDecision | Promise<RateLimitDecision>) {}
  async consume(key: string, cost?: number) {
    this.calls.push({ key, cost });
    return this.next();
  }
}

const allow = (over: Partial<RateLimitDecision> = {}): RateLimitDecision => ({
  allowed: true,
  limit: 10,
  remaining: 7,
  resetMs: 42_100,
  retryAfterMs: 0,
  ...over,
});

function appWith(limiter: RateLimiter, options: RateLimitOptions = {}) {
  const app = express();
  app.get("/thing", rateLimit(limiter, (req) => `who:${req.get("x-who") ?? "anon"}`, options), (_req, res) => {
    res.json({ ok: true });
  });
  app.use(errorHandler);
  return app;
}

describe("rateLimit middleware (TODO 4)", () => {
  it("passes the key from keyFn (and the cost) to the limiter", async () => {
    const limiter = new ScriptedLimiter(() => allow());
    await request(appWith(limiter, { cost: 3 })).get("/thing").set("x-who", "alice");
    expect(limiter.calls).toEqual([{ key: "who:alice", cost: 3 }]);
  });

  it("uses cost 1 by default", async () => {
    const limiter = new ScriptedLimiter(() => allow());
    await request(appWith(limiter)).get("/thing");
    expect(limiter.calls[0]?.cost).toBe(1);
  });

  it("lets allowed requests through with RateLimit-* headers (Reset in whole seconds, rounded up)", async () => {
    const res = await request(appWith(new ScriptedLimiter(() => allow()))).get("/thing");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(res.headers["ratelimit-limit"]).toBe("10");
    expect(res.headers["ratelimit-remaining"]).toBe("7");
    expect(res.headers["ratelimit-reset"], "42.1s → 43").toBe("43");
    expect(res.headers["retry-after"]).toBeUndefined();
  });

  it("rejects with 429, Retry-After and a RATE_LIMITED error body", async () => {
    const limiter = new ScriptedLimiter(() =>
      allow({ allowed: false, remaining: 0, retryAfterMs: 2_300, resetMs: 9_000 }),
    );
    const res = await request(appWith(limiter)).get("/thing");
    expect(res.status).toBe(429);
    expect(res.headers["retry-after"], "2.3s → 3").toBe("3");
    expect(res.headers["ratelimit-remaining"]).toBe("0");
    expect(res.headers["ratelimit-reset"]).toBe("9");
    expect(res.body.error.code).toBe("RATE_LIMITED");
    expect(res.body.error.message).toEqual(expect.any(String));
  });

  it("never sends Retry-After: 0 (clients would retry in a tight loop)", async () => {
    const limiter = new ScriptedLimiter(() => allow({ allowed: false, remaining: 0, retryAfterMs: 0 }));
    const res = await request(appWith(limiter)).get("/thing");
    expect(res.status).toBe(429);
    expect(res.headers["retry-after"]).toBe("1");
  });

  it("fails CLOSED by default: limiter error → 503 RATE_LIMITER_UNAVAILABLE", async () => {
    const onLimiterError = vi.fn();
    const limiter = new ScriptedLimiter(() => Promise.reject(new Error("ECONNREFUSED")));
    const res = await request(appWith(limiter, { onLimiterError })).get("/thing");
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe("RATE_LIMITER_UNAVAILABLE");
    expect(res.body.error.message, "don't leak the internal error").not.toContain("ECONNREFUSED");
    expect(onLimiterError).toHaveBeenCalledTimes(1);
  });

  it("fails OPEN when asked: limiter error → request proceeds, error reported", async () => {
    const onLimiterError = vi.fn();
    const boom = new Error("ECONNREFUSED");
    const limiter = new ScriptedLimiter(() => Promise.reject(boom));
    const res = await request(appWith(limiter, { failOpen: true, onLimiterError })).get("/thing");
    expect(res.status).toBe(200);
    expect(res.headers["ratelimit-limit"], "no limiter answer → no RateLimit headers").toBeUndefined();
    expect(onLimiterError).toHaveBeenCalledTimes(1);
    expect(onLimiterError.mock.calls[0]?.[0]).toBe(boom);
  });
});
