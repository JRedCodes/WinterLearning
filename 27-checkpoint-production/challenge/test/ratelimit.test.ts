import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PASSWORD, createTestEnv, register, type TestEnv } from "./helpers/env.js";

let env: TestEnv;
beforeAll(async () => {
  env = await createTestEnv({ LOGIN_RATE_LIMIT_MAX: "5", LOGIN_RATE_LIMIT_WINDOW_SECONDS: "60" });
});
beforeEach(() => env.reset());
afterAll(() => env.close());

const login = (app: ReturnType<TestEnv["app"]>, email: string, password: string) =>
  request(app).post("/auth/login").send({ email, password });

describe("login rate limiting", () => {
  it("allows 5 attempts per window, then answers 429 with Retry-After, even for the right password", async () => {
    const app = env.app();
    await register(app, "ada@example.com");
    for (let i = 1; i <= 5; i++) {
      const res = await login(app, "ada@example.com", `wrong-${i}-xxxxxxxx`);
      expect(res.status, `attempt ${i} should be allowed`).toBe(401);
    }
    const blocked = await login(app, "ada@example.com", PASSWORD);
    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe("RATE_LIMITED");
    const retryAfter = Number(blocked.headers["retry-after"]);
    expect(retryAfter, "Retry-After = seconds until the window resets").toBeGreaterThanOrEqual(1);
    expect(retryAfter).toBeLessThanOrEqual(60);
  });

  it("is keyed per email (one attacked account doesn't lock out everyone on the same IP)", async () => {
    const app = env.app();
    await register(app, "ada@example.com");
    await register(app, "bob@example.com");
    for (let i = 0; i < 6; i++) await login(app, "ada@example.com", "wrong-password-xx");
    expect((await login(app, "ada@example.com", PASSWORD)).status).toBe(429);
    expect((await login(app, "bob@example.com", PASSWORD)).status).toBe(200);
  });

  it("treats email case-insensitively (ADA@ and ada@ share a counter)", async () => {
    const app = env.app();
    await register(app, "ada@example.com");
    for (let i = 0; i < 5; i++) await login(app, i % 2 ? "ADA@example.com" : "ada@example.com", "wrong-password-xx");
    expect((await login(app, "Ada@Example.com", PASSWORD)).status).toBe(429);
  });

  it("is shared across app instances (state lives in Redis, not in memory)", async () => {
    const a = env.app();
    const b = env.app();
    await register(a, "ada@example.com");
    for (let i = 0; i < 5; i++) await login(i % 2 ? a : b, "ada@example.com", "wrong-password-xx");
    expect((await login(a, "ada@example.com", PASSWORD)).status).toBe(429);
    expect((await login(b, "ada@example.com", PASSWORD)).status).toBe(429);
  });

  it("stores its counters under the module's Redis prefix", async () => {
    const app = env.app();
    await login(app, "ada@example.com", "wrong-password-xx");
    const keys = await env.redis.keys("*");
    expect(keys.length).toBeGreaterThan(0);
    for (const k of keys.filter((k) => !k.startsWith("wl:") || k.startsWith("wl:27:"))) {
      expect(k.startsWith("wl:27:"), `key "${k}" must start with wl:27:`).toBe(true);
    }
  });
});
