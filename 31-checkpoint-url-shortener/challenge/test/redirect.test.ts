import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { ALICE, createLink, createTestEnv, visit, type TestEnv } from "./helpers/env.js";

let env: TestEnv;
beforeAll(async () => {
  env = await createTestEnv();
});
beforeEach(async () => {
  await env.reset();
});
afterAll(async () => {
  await env?.close();
});

describe("GET /:code", () => {
  it("redirects to the long URL (301 or 302: your call, justify it in DECISIONS.md)", async () => {
    const app = env.build().app;
    const link = await createLink(app, { url: "https://example.com/landing?utm=x" });
    const res = await visit(app, link.code);
    expect([301, 302]).toContain(res.status);
    expect(res.headers.location).toBe("https://example.com/landing?utm=x");
  });

  it("works for custom aliases and needs no API key", async () => {
    const app = env.build().app;
    await createLink(app, { url: "https://example.com/sale", alias: "big-sale" });
    const res = await visit(app, "big-sale");
    expect(res.headers.location).toBe("https://example.com/sale");
  });

  it("returns 404 NOT_FOUND (JSON) for unknown codes", async () => {
    const res = await visit(env.build().app, "zzzzzzz");
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });

  it("returns 410 LINK_EXPIRED once a link has expired", async () => {
    const app = env.build().app;
    const link = await createLink(app, { url: "https://example.com", expiresInSeconds: 60 });
    env.clock.advance(59);
    expect([301, 302]).toContain((await visit(app, link.code)).status);
    env.clock.advance(2);
    const res = await visit(app, link.code);
    expect(res.status).toBe(410);
    expect(res.body.error.code).toBe("LINK_EXPIRED");
  });
});

describe("the read path is cached in Redis", () => {
  it("a repeated redirect makes no Postgres calls at all (cache hit + async click recording)", async () => {
    const app = env.build().app;
    const link = await createLink(app, { url: "https://example.com" });
    await visit(app, link.code); // may or may not hit Postgres (write-through or cache-aside: both fine)
    env.db.reset();
    const res = await visit(app, link.code);
    expect([301, 302]).toContain(res.status);
    expect(env.db.calls, "the second redirect for the same code should be served without touching Postgres").toBe(0);
  });

  it("the cache is shared between instances (it lives in Redis, not in process memory)", async () => {
    const a = env.build().app;
    const b = env.build().app; // a second "instance" with the same Redis and pool
    const link = await createLink(a, { url: "https://example.com" });
    await visit(a, link.code);
    env.db.reset();
    const res = await visit(b, link.code);
    expect([301, 302]).toContain(res.status);
    expect(env.db.calls, "instance B should find the link in Redis, cached by instance A").toBe(0);
  });

  it("a cached link still expires on time (expiry is checked on cache hits too)", async () => {
    const app = env.build().app;
    const link = await createLink(app, { url: "https://example.com", expiresInSeconds: 300 });
    await visit(app, link.code);
    await visit(app, link.code); // definitely cached now
    env.clock.advance(301);
    expect((await visit(app, link.code)).status).toBe(410);
  });

  it("deleting a link invalidates the cache immediately", async () => {
    const app = env.build().app;
    const link = await createLink(app, { url: "https://example.com" });
    await visit(app, link.code);
    await visit(app, link.code); // cached
    await request(app).delete(`/api/links/${link.code}`).set("X-API-Key", ALICE).expect(204);
    expect((await visit(app, link.code)).status).toBe(404);
  });

  it("a code that was looked up while unknown works as soon as it's created (no stale negative cache)", async () => {
    const app = env.build().app;
    expect((await visit(app, "fresh-alias")).status).toBe(404);
    await createLink(app, { url: "https://example.com/new", alias: "fresh-alias" });
    const res = await visit(app, "fresh-alias");
    expect(res.headers.location).toBe("https://example.com/new");
  });

  it("keeps redirecting from Postgres if Redis is unavailable (the cache is an accelerator, not a dependency)", async () => {
    const app = env.build().app;
    const link = await createLink(app, { url: "https://example.com/resilient" });
    const { Redis } = await import("ioredis");
    const broken = new Redis({ port: 1, lazyConnect: true, enableOfflineQueue: false, maxRetriesPerRequest: 0, retryStrategy: () => null });
    try {
      const res = await visit(env.build({ redis: broken }).app, link.code);
      expect([301, 302], JSON.stringify(res.body)).toContain(res.status);
      expect(res.headers.location).toBe("https://example.com/resilient");
    } finally {
      broken.disconnect();
    }
  });
});
