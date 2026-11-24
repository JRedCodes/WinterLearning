import { Redis } from "ioredis";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestEnv, type TestEnv } from "./helpers/env.js";

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

describe("health endpoints (no API key needed)", () => {
  it("GET /healthz → 200 { status: 'ok' } (liveness: the process is up)", async () => {
    const res = await request(env.build().app).get("/healthz");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
  });

  it("GET /readyz → 200 when Postgres and Redis respond", async () => {
    const res = await request(env.build().app).get("/readyz");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ready");
  });

  it("GET /readyz → 503 when Redis is unreachable", async () => {
    const broken = new Redis({ port: 1, lazyConnect: true, enableOfflineQueue: false, maxRetriesPerRequest: 0, retryStrategy: () => null });
    try {
      const res = await request(env.build({ redis: broken }).app).get("/readyz");
      expect(res.status).toBe(503);
      expect(res.body.status).not.toBe("ready");
    } finally {
      broken.disconnect();
    }
  });
});
