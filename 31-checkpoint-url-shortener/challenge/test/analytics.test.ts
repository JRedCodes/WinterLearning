import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { ALICE, BOB, createLink, createTestEnv, visit, type TestEnv } from "./helpers/env.js";

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

async function stats(app: Parameters<typeof request>[0], code: string, key = ALICE) {
  return request(app).get(`/api/links/${code}/stats`).set("X-API-Key", key);
}

describe("click analytics (recorded on redirect, aggregated asynchronously)", () => {
  it("stats start at zero", async () => {
    const app = env.build().app;
    const link = await createLink(app, { url: "https://example.com" });
    const res = await stats(app, link.code);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ code: link.code, totalClicks: 0, daily: [] });
  });

  it("clicks are not counted synchronously: they appear after drainClicks() aggregates them", async () => {
    const { app, drainClicks } = env.build();
    const link = await createLink(app, { url: "https://example.com" });
    await visit(app, link.code);
    await visit(app, link.code);
    expect((await stats(app, link.code)).body.data.totalClicks, "the redirect path must not write stats to Postgres").toBe(0);
    expect(await drainClicks()).toBe(2);
    expect((await stats(app, link.code)).body.data.totalClicks).toBe(2);
  });

  it("aggregates per UTC day using the clock at the time of the click", async () => {
    const { app, drainClicks } = env.build();
    const link = await createLink(app, { url: "https://example.com" });
    env.clock.set("2026-03-10T23:59:00.000Z");
    await visit(app, link.code);
    await visit(app, link.code);
    env.clock.set("2026-03-11T00:01:00.000Z");
    await visit(app, link.code);
    await drainClicks();
    const res = await stats(app, link.code);
    expect(res.body.data).toEqual({
      code: link.code,
      totalClicks: 3,
      daily: [
        { date: "2026-03-10", clicks: 2 },
        { date: "2026-03-11", clicks: 1 },
      ],
    });
  });

  it("drainClicks processes everything pending, is idempotent and accumulates across drains", async () => {
    const { app, drainClicks } = env.build();
    const a = await createLink(app, { url: "https://example.com/a" });
    const b = await createLink(app, { url: "https://example.com/b" });
    for (let i = 0; i < 25; i++) await visit(app, i % 5 === 0 ? b.code : a.code);
    expect(await drainClicks()).toBe(25);
    expect(await drainClicks()).toBe(0);
    await visit(app, a.code);
    expect(await drainClicks()).toBe(1);
    expect((await stats(app, a.code)).body.data.totalClicks).toBe(21);
    expect((await stats(app, b.code)).body.data.totalClicks).toBe(5);
  });

  it("works across instances: clicks recorded by one instance are drained by another", async () => {
    const one = env.build();
    const two = env.build();
    const link = await createLink(one.app, { url: "https://example.com" });
    await visit(one.app, link.code);
    await visit(two.app, link.code);
    expect(await two.drainClicks()).toBe(2);
    expect(await one.drainClicks()).toBe(0);
    expect((await stats(one.app, link.code)).body.data.totalClicks).toBe(2);
  });

  it("does not record clicks for unknown or expired links", async () => {
    const { app, drainClicks } = env.build();
    const link = await createLink(app, { url: "https://example.com", expiresInSeconds: 60 });
    await visit(app, "unknown1");
    env.clock.advance(120);
    await visit(app, link.code);
    expect(await drainClicks()).toBe(0);
  });

  it("survives clicks for links deleted before the drain", async () => {
    const { app, drainClicks } = env.build();
    const gone = await createLink(app, { url: "https://example.com/gone" });
    const kept = await createLink(app, { url: "https://example.com/kept" });
    await visit(app, gone.code);
    await visit(app, kept.code);
    await request(app).delete(`/api/links/${gone.code}`).set("X-API-Key", ALICE).expect(204);
    await expect(drainClicks()).resolves.toBe(2);
    expect((await stats(app, kept.code)).body.data.totalClicks).toBe(1);
  });

  it("stats are private to the owner and 404 for unknown codes", async () => {
    const app = env.build().app;
    const link = await createLink(app, { url: "https://example.com" });
    expect((await stats(app, link.code, BOB)).status).toBe(404);
    expect((await stats(app, "nope123")).status).toBe(404);
  });
});
