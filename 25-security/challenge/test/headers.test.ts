import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { ALLOWED_ORIGIN, setupTestApp, type TestApp } from "./helpers.js";

let t: TestApp;
beforeAll(async () => {
  t = await setupTestApp();
});
afterAll(() => t.cleanup());

describe("finding 7: CORS reflects any origin with credentials", () => {
  it("allows the configured frontend origin, with credentials", async () => {
    const res = await request(t.app).get("/health").set("Origin", ALLOWED_ORIGIN);
    expect(res.headers["access-control-allow-origin"]).toBe(ALLOWED_ORIGIN);
    expect(res.headers["access-control-allow-credentials"]).toBe("true");
    expect(res.headers.vary ?? "", "responses differ by Origin, so caches must know").toMatch(/origin/i);
  });

  it("answers preflights from the configured origin", async () => {
    const res = await request(t.app)
      .options("/files")
      .set("Origin", ALLOWED_ORIGIN)
      .set("Access-Control-Request-Method", "POST")
      .set("Access-Control-Request-Headers", "authorization,content-type");
    expect(res.status).toBe(204);
    expect(res.headers["access-control-allow-origin"]).toBe(ALLOWED_ORIGIN);
    expect(res.headers["access-control-allow-methods"]).toMatch(/POST/);
  });

  for (const origin of ["https://evil.example", "null", `${ALLOWED_ORIGIN}.evil.example`, "http://app.files.test"]) {
    it(`does not grant access to ${origin}`, async () => {
      const simple = await request(t.app).get("/me").set("Origin", origin).set("Authorization", t.users.alice.auth);
      expect(simple.headers["access-control-allow-origin"]).toBeUndefined();
      expect(simple.headers["access-control-allow-credentials"]).toBeUndefined();

      const preflight = await request(t.app)
        .options("/me")
        .set("Origin", origin)
        .set("Access-Control-Request-Method", "PATCH");
      expect(preflight.headers["access-control-allow-origin"]).toBeUndefined();
    });
  }
});

describe("finding 8: missing security headers", () => {
  it("does not advertise the framework", async () => {
    const res = await request(t.app).get("/health");
    expect(res.headers["x-powered-by"]).toBeUndefined();
  });

  it("sets the standard protective headers", async () => {
    const res = await request(t.app).get("/health");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["strict-transport-security"]).toMatch(/max-age=\d+/);
    expect(res.headers["content-security-policy"]).toBeDefined();
    expect(res.headers["x-frame-options"] ?? res.headers["content-security-policy"]).toMatch(/DENY|SAMEORIGIN|frame-ancestors/i);
    expect(res.headers["referrer-policy"]).toBeDefined();
  });

  it("sets them on error responses too", async () => {
    const res = await request(t.app).get("/files");
    expect(res.status).toBe(401);
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
  });
});
