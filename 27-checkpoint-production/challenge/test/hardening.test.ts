import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestEnv, loginAs, type TestEnv } from "./helpers/env.js";

let env: TestEnv;
beforeAll(async () => {
  env = await createTestEnv();
});
beforeEach(() => env.reset());
afterAll(() => env.close());

describe("errors don't leak", () => {
  it("unexpected errors -> generic 500 with a request id, details only in the logs", async () => {
    const app = env.app();
    const { cookie } = await loginAs(app, "ada@example.com");
    await env.pool.query("DROP TABLE notes CASCADE"); // simulate a broken database
    const res = await request(app).get("/notes").set("Cookie", cookie).set("X-Request-Id", "req-500-test");

    expect(res.status).toBe(500);
    expect(res.body).toEqual({
      error: { code: "INTERNAL_ERROR", message: "Something went wrong", requestId: "req-500-test" },
    });
    expect(JSON.stringify(res.body)).not.toMatch(/relation|stack|notes|at \w/);

    const errorLogs = env.logs.entries.filter((e) => Number(e.level) >= 50);
    expect(errorLogs.length, "log unexpected errors at level error (50) via the injected logger").toBeGreaterThan(0);
    expect(errorLogs.some((e) => e.requestId === "req-500-test"), "error logs carry the requestId").toBe(true);
  });

  it("every error body has { code, message, requestId }", async () => {
    const res = await request(env.app()).get("/auth/me");
    expect(res.status).toBe(401);
    expect(res.body.error).toEqual({ code: "UNAUTHENTICATED", message: expect.any(String), requestId: expect.any(String) });
  });

  it("unknown routes -> JSON 404 ROUTE_NOT_FOUND", async () => {
    const res = await request(env.app()).get("/admin/secret");
    expect(res.status).toBe(404);
    expect(res.headers["content-type"]).toMatch(/application\/json/);
    expect(res.body.error.code).toBe("ROUTE_NOT_FOUND");
  });
});

describe("request ids", () => {
  it("sets X-Request-Id on every response and reuses a valid incoming one", async () => {
    const app = env.app();
    const a = await request(app).get("/healthz");
    expect(a.headers["x-request-id"]).toMatch(/^[A-Za-z0-9_-]{8,128}$/);
    const b = await request(app).get("/healthz").set("X-Request-Id", "abc-123_XYZ");
    expect(b.headers["x-request-id"]).toBe("abc-123_XYZ");
    const c = await request(app).get("/healthz").set("X-Request-Id", "bad id; with <spaces>");
    expect(c.headers["x-request-id"], "untrusted ids that could forge log lines must be replaced").not.toContain("bad");
  });
});

describe("security headers", () => {
  it("sends the standard security headers and hides the framework", async () => {
    const res = await request(env.app()).get("/healthz");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["content-security-policy"], "Content-Security-Policy").toBeDefined();
    expect(res.headers["strict-transport-security"], "Strict-Transport-Security").toBeDefined();
    expect(res.headers["x-frame-options"], "X-Frame-Options").toBeDefined();
    expect(res.headers["x-powered-by"], "don't advertise Express").toBeUndefined();
  });

  it("also on error responses", async () => {
    const res = await request(env.app()).get("/nope");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
  });
});
