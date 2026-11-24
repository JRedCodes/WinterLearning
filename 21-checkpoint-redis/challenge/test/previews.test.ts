import { afterEach, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { Redis } from "ioredis";
import { FakeFetcher, KEY, OTHER_KEY, REDIS_URL, resetDatabase, scanKeys, start, uniqueUrl, waitFor, type Running } from "./helpers/harness.js";

let running: Running[] = [];
async function boot(...args: Parameters<typeof start>) {
  const r = await start(...args);
  running.push(r);
  return r;
}

beforeAll(resetDatabase);
afterEach(async () => {
  for (const r of running) await r.stop();
  running = [];
});

const post = (r: Running, url: unknown, key = KEY) => request(r.system.app).post("/previews").set("x-api-key", key).send({ url });
const get = (r: Running, url: string, key = KEY) => request(r.system.app).get("/previews").query({ url }).set("x-api-key", key);

async function untilReady(r: Running, url: string) {
  let last: request.Response | undefined;
  await waitFor(async () => {
    last = await get(r, url);
    return last.status === 200 && last.body.data?.status === "ready";
  }, `preview for ${url} to become ready`);
  return last!;
}

describe("health & auth", () => {
  it("GET /health works without an API key", async () => {
    const r = await boot();
    const res = await request(r.system.app).get("/health");
    expect(res.status).toBe(200);
  });

  it("rejects missing or unknown API keys with 401 UNAUTHORIZED", async () => {
    const r = await boot();
    const none = await request(r.system.app).post("/previews").send({ url: uniqueUrl() });
    expect(none.status).toBe(401);
    expect(none.body.error.code).toBe("UNAUTHORIZED");
    const wrong = await post(r, uniqueUrl(), "nope");
    expect(wrong.status).toBe(401);
    expect(r.fetcher.calls).toHaveLength(0);
  });
});

describe("POST /previews", () => {
  it("validates the url: absolute http(s) only", async () => {
    const r = await boot();
    for (const bad of [undefined, "", "not a url", "ftp://x.test/file", "javascript:alert(1)", 42, `https://x.test/${"a".repeat(2100)}`]) {
      const res = await post(r, bad);
      expect(res.status, `url=${JSON.stringify(bad)?.slice(0, 40)}`).toBe(400);
      expect(res.body.error.code).toBe("VALIDATION_FAILED");
    }
  });

  it("returns 202 + pending + jobId + Location for a new URL, then the worker makes it ready", async () => {
    const r = await boot();
    const url = uniqueUrl();
    const res = await post(r, url);
    expect(res.status).toBe(202);
    expect(res.body.data).toMatchObject({ url, status: "pending", jobId: expect.any(String) });
    expect(res.headers.location).toBe(`/previews?url=${encodeURIComponent(url)}`);

    const ready = await untilReady(r, url);
    expect(ready.body.data).toMatchObject({
      url,
      status: "ready",
      title: `Title of ${new URL(url).hostname}`,
      description: expect.any(String),
      imageUrl: expect.any(String),
    });
    expect(Number.isNaN(Date.parse(ready.body.data.fetchedAt))).toBe(false);
  });

  it("returns 200 with the preview once it exists, without fetching again", async () => {
    const r = await boot();
    const url = uniqueUrl();
    await post(r, url);
    await untilReady(r, url);
    const again = await post(r, url);
    expect(again.status).toBe(200);
    expect(again.body.data.status).toBe("ready");
    expect(r.fetcher.calls).toHaveLength(1);
  });

  it("dedupes concurrent requests for the same URL: one job, one fetch", async () => {
    const r = await boot({ fetcher: new FakeFetcher({ delayMs: 300 }) });
    const url = uniqueUrl();
    const responses = await Promise.all(Array.from({ length: 20 }, () => post(r, url)));
    expect(responses.every((res) => res.status === 202), "all should be accepted while pending").toBe(true);
    const jobIds = new Set(responses.map((res) => res.body.data.jobId));
    expect(jobIds.size, "every caller should get the same job").toBe(1);
    await untilReady(r, url);
    expect(r.fetcher.calls).toHaveLength(1);
  });

  it("treats URLs that differ only by #fragment or host case as the same preview", async () => {
    const r = await boot({ fetcher: new FakeFetcher({ delayMs: 200 }) });
    const url = uniqueUrl("page");
    const variant = url.replace("https://site-", "https://SITE-") + "#comments";
    const a = await post(r, url);
    const b = await post(r, variant);
    expect(b.body.data.jobId).toBe(a.body.data.jobId);
    expect(b.body.data.url, "responses use the normalized url").toBe(url);
    await untilReady(r, url);
    expect(r.fetcher.calls).toEqual([url]);
  });
});

describe("GET /previews?url=", () => {
  it("400 without a valid url, 404 for a URL nobody asked for", async () => {
    const r = await boot();
    expect((await request(r.system.app).get("/previews").set("x-api-key", KEY)).status).toBe(400);
    const res = await get(r, uniqueUrl());
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });

  it("202 pending while the job is running", async () => {
    const r = await boot({ fetcher: new FakeFetcher({ delayMs: 400 }) });
    const url = uniqueUrl();
    const created = await post(r, url);
    const res = await get(r, url);
    expect(res.status).toBe(202);
    expect(res.body.data).toEqual({ url, status: "pending", jobId: created.body.data.jobId });
  });
});

describe("worker: retries, failures, persistence, caching", () => {
  it("retries transient fetch failures", async () => {
    const r = await boot({ fetcher: new FakeFetcher({ failures: 2 }) });
    const url = uniqueUrl();
    await post(r, url);
    await untilReady(r, url);
    expect(r.fetcher.calls).toHaveLength(3);
  });

  it("records a failed preview after the last attempt", async () => {
    const r = await boot({ fetcher: new FakeFetcher({ failures: 99 }) });
    const url = uniqueUrl();
    await post(r, url);
    await waitFor(async () => (await get(r, url)).body.data?.status === "failed", "status failed");
    const res = await get(r, url);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ url, status: "failed", error: expect.stringContaining("timed out") });
    expect(r.fetcher.calls).toHaveLength(3);
  });

  it("does not retry a PermanentFetchError", async () => {
    const r = await boot({ fetcher: new FakeFetcher({ permanent: true }) });
    const url = uniqueUrl();
    await post(r, url);
    await waitFor(async () => (await get(r, url)).body.data?.status === "failed", "status failed");
    expect(r.fetcher.calls).toHaveLength(1);
  });

  it("stores ready previews in Postgres: a fresh system (empty Redis namespace) still knows them", async () => {
    const first = await boot();
    const url = uniqueUrl();
    await post(first, url);
    await untilReady(first, url);

    const second = await boot(); // new namespace → nothing cached, no shared queue
    const res = await post(second, url);
    expect(res.status, "the preview should come from Postgres").toBe(200);
    expect(res.body.data.status).toBe("ready");
    expect(second.fetcher.calls).toHaveLength(0);
  });

  it("caches ready previews in Redis under the namespace with the configured TTL", async () => {
    const r = await boot({ cacheTtlSeconds: 120 });
    const url = uniqueUrl();
    await post(r, url);
    await untilReady(r, url);
    await get(r, url);

    const redis = new Redis(REDIS_URL);
    try {
      const keys = await scanKeys(redis, r.prefix);
      let cached = false;
      for (const k of keys) {
        if ((await redis.type(k)) !== "string") continue;
        const value = await redis.get(k);
        const ttl = await redis.pttl(k);
        if (value?.includes(`Title of ${new URL(url).hostname}`) && ttl > 0 && ttl <= 120_000) cached = true;
      }
      expect(cached, `expected a string key under ${r.prefix} holding the preview, with a TTL ≤ 120s`).toBe(true);
    } finally {
      redis.disconnect();
    }
  });
});

describe("rate limiting per API key", () => {
  it("429 with Retry-After after the limit; other keys are unaffected", async () => {
    const r = await boot({ rateLimit: { limit: 5, windowMs: 60_000 } });
    const statuses = [];
    for (let i = 0; i < 6; i++) statuses.push((await get(r, uniqueUrl())).status);
    expect(statuses.slice(0, 5)).toEqual([404, 404, 404, 404, 404]);
    expect(statuses[5]).toBe(429);

    const limited = await get(r, uniqueUrl());
    expect(limited.body.error.code).toBe("RATE_LIMITED");
    expect(Number(limited.headers["retry-after"])).toBeGreaterThanOrEqual(1);
    expect((await get(r, uniqueUrl(), OTHER_KEY)).status).toBe(404);
  });

  it("is shared between two instances of the same system (same namespace)", async () => {
    const a = await boot({ rateLimit: { limit: 10, windowMs: 60_000 } });
    const b = await boot({ rateLimit: { limit: 10, windowMs: 60_000 }, namespace: a.namespace });
    const responses = await Promise.all(Array.from({ length: 30 }, (_, i) => get(i % 2 ? a : b, uniqueUrl())));
    expect(responses.filter((res) => res.status !== 429)).toHaveLength(10);
  });
});

describe("lifecycle", () => {
  it("close() waits for the active fetch to finish and persist", async () => {
    const r = await boot({ fetcher: new FakeFetcher({ delayMs: 400 }) });
    const url = uniqueUrl();
    await post(r, url);
    await waitFor(() => r.fetcher.calls.length === 1, "fetch started");
    await r.stop();

    const fresh = await boot();
    const res = await get(fresh, url);
    expect(res.status, "the in-flight preview should have been saved before shutdown").toBe(200);
    expect(res.body.data.status).toBe("ready");
  });
});
