import pg from "pg";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PASSWORD, createTestEnv, loginAs, type TestEnv } from "./helpers/env.js";

let env: TestEnv;
beforeAll(async () => {
  env = await createTestEnv();
});
beforeEach(() => env.reset());
afterAll(() => env.close());

describe("structured request logs", () => {
  it("logs exactly one JSON line per request with requestId, method, url, statusCode and durationMs", async () => {
    await request(env.app()).get("/healthz").set("X-Request-Id", "log-me-please");
    const lines = env.logs.entries.filter((e) => e.requestId === "log-me-please" && e.msg === "request completed");
    expect(lines, 'log one line with msg "request completed" when the response finishes').toHaveLength(1);
    expect(lines[0]).toMatchObject({ level: 30, method: "GET", url: "/healthz", statusCode: 200 });
    expect(typeof lines[0]!.durationMs).toBe("number");
  });

  it("never logs passwords, session ids or authorization headers", async () => {
    const app = env.app();
    const { cookie, sid } = await loginAs(app, "ada@example.com");
    await request(app).get("/auth/me").set("Cookie", cookie).set("Authorization", "Bearer top-secret-token-123");
    await request(app).post("/auth/login").send({ email: "ada@example.com", password: "wrong-but-secret-pw" });
    expect(env.logs.lines.length, "the app should be logging through the injected logger").toBeGreaterThan(0);
    const raw = env.logs.raw;
    expect(raw).not.toContain(PASSWORD);
    expect(raw).not.toContain("wrong-but-secret-pw");
    expect(raw).not.toContain(sid);
    expect(raw).not.toContain("top-secret-token-123");
  });
});

describe("metrics", () => {
  it("GET /metrics exposes Prometheus text with request counters and a latency histogram", async () => {
    const app = env.app();
    await request(app).get("/healthz");
    const res = await request(app).get("/metrics");
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/text\/plain/);
    expect(res.text).toMatch(/^http_requests_total\{.*method="GET".*route="\/healthz".*status_code="200".*\} 1$/m);
    expect(res.text).toMatch(/^http_request_duration_seconds_bucket\{/m);
  });

  it("labels routes by template, never by raw id (cardinality!)", async () => {
    const app = env.app();
    const { cookie } = await loginAs(app, "ada@example.com");
    const note = (await request(app).post("/notes").set("Cookie", cookie).send({ title: "t" })).body.data;
    await request(app).get(`/notes/${note.id}`).set("Cookie", cookie);
    await request(app).get("/notes/7d0f3c8e-0000-4000-8000-000000000000").set("Cookie", cookie);
    const text = (await request(app).get("/metrics")).text;
    expect(text).toContain('route="/notes/:id"');
    expect(text).not.toContain(note.id);
    expect(text).not.toContain("7d0f3c8e");
  });

  it("each app instance has its own registry (creating two apps doesn't throw or share counts)", async () => {
    const a = env.app();
    const b = env.app();
    await request(a).get("/healthz");
    await request(a).get("/healthz");
    await request(b).get("/healthz");
    const textB = (await request(b).get("/metrics")).text;
    expect(textB).toMatch(/^http_requests_total\{.*route="\/healthz".*\} 1$/m);
  });
});

describe("health and readiness", () => {
  it("GET /healthz is 200 and doesn't need a session", async () => {
    const res = await request(env.app()).get("/healthz");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok" });
  });

  it("GET /readyz is 200 when Postgres and Redis answer", async () => {
    const res = await request(env.app()).get("/readyz");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: "ready", checks: { postgres: "ok", redis: "ok" } });
  });

  it("GET /readyz is 503 (quickly) when Postgres is unreachable", async () => {
    const deadPool = new pg.Pool({ connectionString: "postgres://postgres:postgres@127.0.0.1:5499/wl_27", connectionTimeoutMillis: 500 });
    deadPool.on("error", () => {});
    try {
      const started = Date.now();
      const res = await request(env.app({ pool: deadPool })).get("/readyz");
      expect(res.status).toBe(503);
      expect(res.body).toMatchObject({ status: "unavailable", checks: { postgres: "fail", redis: "ok" } });
      expect(Date.now() - started).toBeLessThan(3_000);
    } finally {
      await deadPool.end();
    }
  });

  it("GET /readyz is 503 while shutting down", async () => {
    const res = await request(env.app({ isShuttingDown: () => true })).get("/readyz");
    expect(res.status).toBe(503);
    expect(res.body.status).toBe("shutting_down");
  });
});
