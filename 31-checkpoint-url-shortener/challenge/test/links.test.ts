import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { ALICE, BOB, createLink, createTestEnv, type TestEnv } from "./helpers/env.js";

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

describe("authentication on /api", () => {
  it("rejects requests without an API key: 401 UNAUTHORIZED", async () => {
    const res = await request(env.build().app).post("/api/links").send({ url: "https://example.com" });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHORIZED");
  });

  it("rejects unknown API keys", async () => {
    const res = await request(env.build().app).post("/api/links").set("X-API-Key", "nope").send({ url: "https://example.com" });
    expect(res.status).toBe(401);
  });
});

describe("POST /api/links", () => {
  it("creates a link with a generated 7-character base62 code", async () => {
    const app = env.build().app;
    const res = await request(app).post("/api/links").set("X-API-Key", ALICE).send({ url: "https://example.com/a/very/long/path?x=1" });
    expect(res.status).toBe(201);
    const link = res.body.data;
    expect(link.code).toMatch(/^[0-9A-Za-z]{7}$/);
    expect(link.url).toBe("https://example.com/a/very/long/path?x=1");
    expect(link.shortUrl).toBe(`https://sho.rt/${link.code}`);
    expect(link.createdAt).toBe("2026-03-10T12:00:00.000Z"); // from the injected clock
    expect(link.expiresAt).toBeNull();
    expect(res.headers.location).toBe(`/api/links/${link.code}`);
  });

  it("generates unique codes", async () => {
    const app = env.build().app;
    const codes = new Set<string>();
    for (let i = 0; i < 40; i++) codes.add((await createLink(app, { url: `https://example.com/${i}` })).code);
    expect(codes.size).toBe(40);
  });

  it("accepts a custom alias", async () => {
    const link = await createLink(env.build().app, { url: "https://example.com", alias: "spring-sale_26" });
    expect(link.code).toBe("spring-sale_26");
    expect(link.shortUrl).toBe("https://sho.rt/spring-sale_26");
  });

  it("returns 409 ALIAS_TAKEN for a duplicate alias", async () => {
    const app = env.build().app;
    await createLink(app, { url: "https://example.com", alias: "taken" });
    const res = await request(app).post("/api/links").set("X-API-Key", BOB).send({ url: "https://other.example", alias: "taken" });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("ALIAS_TAKEN");
  });

  it("is race-free: 20 concurrent requests for the same alias → exactly one 201", async () => {
    const app = env.build().app;
    const results = await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        request(app).post("/api/links").set("X-API-Key", ALICE).send({ url: `https://example.com/${i}`, alias: "launch" }),
      ),
    );
    const statuses = results.map((r) => r.status).sort();
    expect(statuses.filter((s) => s === 201)).toHaveLength(1);
    expect(statuses.filter((s) => s === 409)).toHaveLength(19);
  });

  it("sets expiresAt from expiresInSeconds", async () => {
    const link = await createLink(env.build().app, { url: "https://example.com", expiresInSeconds: 3600 });
    expect(link.expiresAt).toBe("2026-03-10T13:00:00.000Z");
  });

  const invalid: [string, Record<string, unknown>][] = [
    ["missing url", {}],
    ["url is not a string", { url: 42 }],
    ["not a URL", { url: "not a url" }],
    ["non-http scheme", { url: "ftp://example.com/file" }],
    ["javascript: URL", { url: "javascript:alert(1)" }],
    ["URL longer than 2048 chars", { url: `https://example.com/${"a".repeat(2050)}` }],
    ["alias too short", { url: "https://example.com", alias: "abc" }],
    ["alias with bad characters", { url: "https://example.com", alias: "no spaces!" }],
    ["alias longer than 32", { url: "https://example.com", alias: "a".repeat(33) }],
    ["reserved alias 'api'", { url: "https://example.com", alias: "api" }],
    ["reserved alias 'healthz' (any case)", { url: "https://example.com", alias: "HealthZ" }],
    ["negative expiry", { url: "https://example.com", expiresInSeconds: -1 }],
    ["zero expiry", { url: "https://example.com", expiresInSeconds: 0 }],
    ["fractional expiry", { url: "https://example.com", expiresInSeconds: 1.5 }],
  ];
  for (const [name, body] of invalid) {
    it(`400 VALIDATION_ERROR: ${name}`, async () => {
      const res = await request(env.build().app).post("/api/links").set("X-API-Key", ALICE).send(body);
      expect(res.status, JSON.stringify(res.body)).toBe(400);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
      expect(typeof res.body.error.message).toBe("string");
    });
  }

  it("400 INVALID_JSON for a malformed body", async () => {
    const res = await request(env.build().app)
      .post("/api/links")
      .set("X-API-Key", ALICE)
      .set("Content-Type", "application/json")
      .send('{"url": ');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("INVALID_JSON");
  });
});

describe("GET /api/links/:code", () => {
  it("returns the link to its owner", async () => {
    const app = env.build().app;
    const link = await createLink(app, { url: "https://example.com/x" });
    const res = await request(app).get(`/api/links/${link.code}`).set("X-API-Key", ALICE);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual(link);
  });

  it("returns 404 NOT_FOUND to other keys (links are private to the key that created them)", async () => {
    const app = env.build().app;
    const link = await createLink(app, { url: "https://example.com/x" });
    const res = await request(app).get(`/api/links/${link.code}`).set("X-API-Key", BOB);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });

  it("returns 404 NOT_FOUND for unknown codes", async () => {
    const res = await request(env.build().app).get("/api/links/nope123").set("X-API-Key", ALICE);
    expect(res.status).toBe(404);
  });
});

describe("DELETE /api/links/:code", () => {
  it("lets the owner delete: 204, then 404", async () => {
    const app = env.build().app;
    const link = await createLink(app, { url: "https://example.com/x" });
    const del = await request(app).delete(`/api/links/${link.code}`).set("X-API-Key", ALICE);
    expect(del.status).toBe(204);
    expect(del.text).toBe("");
    const res = await request(app).get(`/api/links/${link.code}`).set("X-API-Key", ALICE);
    expect(res.status).toBe(404);
  });

  it("returns 404 to a non-owner and leaves the link alone", async () => {
    const app = env.build().app;
    const link = await createLink(app, { url: "https://example.com/x" });
    const del = await request(app).delete(`/api/links/${link.code}`).set("X-API-Key", BOB);
    expect(del.status).toBe(404);
    const res = await request(app).get(`/api/links/${link.code}`).set("X-API-Key", ALICE);
    expect(res.status).toBe(200);
  });
});

describe("unknown API routes", () => {
  it("return a JSON 404", async () => {
    const res = await request(env.build().app).get("/api/nope/really").set("X-API-Key", ALICE);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBeTypeOf("string");
  });
});
