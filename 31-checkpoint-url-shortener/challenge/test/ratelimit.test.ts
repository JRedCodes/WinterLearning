import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { ALICE, BOB, createTestEnv, visit, type TestEnv } from "./helpers/env.js";

let env: TestEnv;
beforeAll(async () => {
  env = await createTestEnv({ RATE_LIMIT_MAX: "3", RATE_LIMIT_WINDOW_SECONDS: "60" });
});
beforeEach(async () => {
  await env.reset();
});
afterAll(async () => {
  await env?.close();
});

const create = (app: Parameters<typeof request>[0], key: string, i: number) =>
  request(app).post("/api/links").set("X-API-Key", key).send({ url: `https://example.com/${i}` });

describe("rate limiting link creation per API key", () => {
  it("allows RATE_LIMIT_MAX creations per window, then 429 RATE_LIMITED with Retry-After", async () => {
    const app = env.build().app;
    for (let i = 0; i < 3; i++) expect((await create(app, ALICE, i)).status).toBe(201);
    const res = await create(app, ALICE, 99);
    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe("RATE_LIMITED");
    const retryAfter = Number(res.headers["retry-after"]);
    expect(Number.isInteger(retryAfter), `Retry-After should be whole seconds, got ${res.headers["retry-after"]}`).toBe(true);
    expect(retryAfter).toBeGreaterThanOrEqual(1);
    expect(retryAfter).toBeLessThanOrEqual(60);
  });

  it("a rejected request creates nothing", async () => {
    const app = env.build().app;
    for (let i = 0; i < 4; i++) await create(app, ALICE, i);
    const { rows } = await env.pool.query("SELECT count(*)::int AS n FROM links");
    expect(rows[0].n).toBe(3);
  });

  it("limits are per key", async () => {
    const app = env.build().app;
    for (let i = 0; i < 4; i++) await create(app, ALICE, i);
    expect((await create(app, BOB, 1)).status).toBe(201);
  });

  it("the window resets (driven by the injected clock)", async () => {
    const app = env.build().app;
    for (let i = 0; i < 4; i++) await create(app, ALICE, i);
    env.clock.advance(60);
    expect((await create(app, ALICE, 10)).status).toBe(201);
  });

  it("is shared across instances (state in Redis) and exact under concurrency", async () => {
    const a = env.build().app;
    const b = env.build().app;
    const results = await Promise.all(Array.from({ length: 10 }, (_, i) => create(i % 2 ? a : b, ALICE, i)));
    expect(results.filter((r) => r.status === 201)).toHaveLength(3);
    expect(results.filter((r) => r.status === 429)).toHaveLength(7);
  });

  it("does not limit redirects", async () => {
    const app = env.build().app;
    const created = await create(app, ALICE, 1);
    for (let i = 0; i < 10; i++) expect([301, 302]).toContain((await visit(app, created.body.data.code)).status);
  });
});
