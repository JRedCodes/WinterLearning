import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PASSWORD, PREFIX, createTestEnv, loginAs, register, sessionCookie, type TestEnv } from "./helpers/env.js";

let env: TestEnv;
beforeAll(async () => {
  env = await createTestEnv();
});
beforeEach(() => env.reset());
afterAll(() => env.close());

describe("registration", () => {
  it("POST /auth/register creates a user and never returns password data", async () => {
    const res = await register(env.app(), "Ada@Example.com");
    expect(res.status).toBe(201);
    expect(res.body.data).toEqual({ id: expect.any(String), email: "ada@example.com" });
    expect(JSON.stringify(res.body)).not.toMatch(/password|hash/i);
  });

  it("rejects a duplicate email, case-insensitively, with 409 EMAIL_TAKEN", async () => {
    await register(env.app(), "ada@example.com");
    const res = await register(env.app(), "ADA@example.com");
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("EMAIL_TAKEN");
  });

  it.each([
    [{ email: "not-an-email", password: PASSWORD }, "email"],
    [{ email: "ada@example.com", password: "short" }, "password"],
    [{ email: "ada@example.com" }, "password"],
  ])("validates the body: %j -> 400 with details for %s", async (body, field) => {
    const res = await request(env.app()).post("/auth/register").send(body);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(res.body.error.details).toEqual(expect.arrayContaining([expect.objectContaining({ path: field, message: expect.any(String) })]));
  });

  it("stores a salted password hash, never the password", async () => {
    await register(env.app(), "ada@example.com");
    await register(env.app(), "bob@example.com");
    const { rows } = await env.pool.query<{ password_hash: string }>("SELECT password_hash FROM users ORDER BY email");
    expect(rows).toHaveLength(2);
    for (const r of rows) {
      expect(r.password_hash).not.toContain(PASSWORD);
      expect(r.password_hash.length).toBeGreaterThanOrEqual(32);
    }
    expect(rows[0]!.password_hash, "same password, different users -> different hashes (salt!)").not.toBe(rows[1]!.password_hash);
  });
});

describe("login, sessions and logout", () => {
  it("POST /auth/login sets an HttpOnly, SameSite=Lax session cookie backed by Redis", async () => {
    const app = env.app();
    await register(app, "ada@example.com");
    const res = await request(app).post("/auth/login").send({ email: "ADA@example.com", password: PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ email: "ada@example.com" });

    const session = sessionCookie(res);
    expect(session, "expected a Set-Cookie header named sid").toBeDefined();
    expect(session!.sid.length, "session ids need lots of entropy").toBeGreaterThanOrEqual(32);
    expect(session!.raw).toMatch(/;\s*HttpOnly/i);
    expect(session!.raw).toMatch(/;\s*SameSite=Lax/i);
    expect(session!.raw).toMatch(/;\s*Path=\//i);
    expect(session!.raw, "Secure only when COOKIE_SECURE=true").not.toMatch(/;\s*Secure/i);

    const ttl = await env.redis.ttl(`${PREFIX}sess:${session!.sid}`);
    expect(ttl, `expected Redis key ${PREFIX}sess:<sid> with a TTL`).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(env.config.sessionTtlSeconds);
  });

  it("adds the Secure flag when cookieSecure is on", async () => {
    const app = env.app({ config: { ...env.config, cookieSecure: true } });
    const { raw } = await loginAs(app, "ada@example.com");
    expect(raw).toMatch(/;\s*Secure/i);
  });

  it("gives the same 401 for a wrong password and an unknown email (no user enumeration)", async () => {
    const app = env.app();
    await register(app, "ada@example.com");
    const wrong = await request(app).post("/auth/login").send({ email: "ada@example.com", password: "wrong password!!" });
    const unknown = await request(app).post("/auth/login").send({ email: "nobody@example.com", password: PASSWORD });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body.error.code).toBe("INVALID_CREDENTIALS");
    expect(unknown.body.error.code).toBe(wrong.body.error.code);
    expect(unknown.body.error.message, "identical message for both cases").toBe(wrong.body.error.message);
    expect(sessionCookie(wrong)).toBeUndefined();
  });

  it("GET /auth/me returns the user for a valid session, 401 UNAUTHENTICATED otherwise", async () => {
    const app = env.app();
    const { cookie, user } = await loginAs(app, "ada@example.com");
    const me = await request(app).get("/auth/me").set("Cookie", cookie);
    expect(me.status).toBe(200);
    expect(me.body.data).toEqual({ id: user.id, email: "ada@example.com" });

    for (const c of [undefined, "sid=forged-session-id-that-does-not-exist", "other=1"]) {
      const res = c ? await request(app).get("/auth/me").set("Cookie", c) : await request(app).get("/auth/me");
      expect(res.status, `cookie: ${c}`).toBe(401);
      expect(res.body.error.code).toBe("UNAUTHENTICATED");
    }
  });

  it("issues a fresh session id on every login", async () => {
    const app = env.app();
    const a = await loginAs(app, "ada@example.com");
    const b = await loginAs(app, "ada@example.com");
    expect(b.sid).not.toBe(a.sid);
  });

  it("POST /auth/logout destroys the session server-side", async () => {
    const app = env.app();
    const { cookie, sid } = await loginAs(app, "ada@example.com");
    const out = await request(app).post("/auth/logout").set("Cookie", cookie);
    expect(out.status).toBe(204);
    expect(await env.redis.exists(`${PREFIX}sess:${sid}`)).toBe(0);
    expect((await request(app).get("/auth/me").set("Cookie", cookie)).status).toBe(401);
  });
});
