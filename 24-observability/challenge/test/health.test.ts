import { describe, expect, it } from "vitest";
import request from "supertest";
import { buildTestApp } from "./helpers.js";

const failing = { name: "payments", check: async () => Promise.reject(new Error("connect ECONNREFUSED")) };
const passing = { name: "payments", check: async () => {} };
const hanging = { name: "payments", check: () => new Promise<void>(() => {}) };

describe("finding 5: liveness vs readiness", () => {
  it("/healthz (liveness) is 200 even when a dependency is down: restarting us won't fix payments", async () => {
    const { app } = buildTestApp({ readinessChecks: [failing] });
    const res = await request(app).get("/healthz");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok" });
  });

  it("/healthz does not call dependency checks at all", async () => {
    let called = 0;
    const counting = { name: "payments", check: async () => void called++ };
    const { app } = buildTestApp({ readinessChecks: [counting] });
    await request(app).get("/healthz").expect(200);
    expect(called).toBe(0);
  });

  it("/readyz is 200 with per-check results when every dependency is fine", async () => {
    const { app } = buildTestApp({ readinessChecks: [passing, { name: "cache", check: async () => {} }] });
    const res = await request(app).get("/readyz");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok", checks: { payments: { ok: true }, cache: { ok: true } } });
  });

  it("/readyz is 503 and names the failing dependency when one is down", async () => {
    const { app } = buildTestApp({ readinessChecks: [failing, { name: "cache", check: async () => {} }] });
    const res = await request(app).get("/readyz");
    expect(res.status).toBe(503);
    expect(res.body.status).toBe("unavailable");
    expect(res.body.checks.payments).toMatchObject({ ok: false });
    expect(res.body.checks.cache).toEqual({ ok: true });
  });

  it("/readyz gives up on a hanging check after the timeout and reports it as failed", async () => {
    const { app } = buildTestApp({ readinessChecks: [hanging], readinessTimeoutMs: 100 });
    const started = Date.now();
    const res = await request(app).get("/readyz");
    expect(Date.now() - started, "readyz must not hang with its dependency").toBeLessThan(1000);
    expect(res.status).toBe(503);
    expect(res.body.checks.payments.ok).toBe(false);
    expect(res.body.checks.payments.error).toMatch(/timed? ?out/i);
  });

  it("uses the real payments ping by default (fake network down -> not ready)", async () => {
    const { app } = buildTestApp({ mode: "down" });
    await request(app).get("/readyz").expect(503);
    await request(app).get("/healthz").expect(200);
  });
});
