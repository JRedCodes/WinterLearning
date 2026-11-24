import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  closeTestContext,
  createAdmin,
  createTestContext,
  login,
  PASSWORD,
  register,
  registerAndLogin,
  resetState,
  sessionCookieFrom,
  type TestContext,
} from "./helpers.js";

let ctx: TestContext;
beforeAll(async () => {
  ctx = await createTestContext();
});
beforeEach(async () => {
  await resetState(ctx);
});
afterAll(async () => {
  await closeTestContext(ctx);
});

describe("TODO(4) · POST /auth/register", () => {
  it("creates a user with role 'user' and returns 201 without any password data", async () => {
    const res = await request(ctx.app).post("/auth/register").send({ email: "  Ada@Example.COM ", password: PASSWORD });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ email: "ada@example.com", role: "user" });
    expect(res.body.data.id).toEqual(expect.any(String));
    expect(JSON.stringify(res.body)).not.toMatch(/password|hash|scrypt/i);
  });

  it("stores a scrypt hash, never the password", async () => {
    await register(ctx.app, "ada@example.com");
    const { rows } = await ctx.pool.query("SELECT password_hash FROM users WHERE email = 'ada@example.com'");
    expect(rows[0].password_hash).toMatch(/^scrypt\$/);
    expect(rows[0].password_hash).not.toContain(PASSWORD);
  });

  it("rejects a duplicate email (case-insensitive) with 409 EMAIL_TAKEN", async () => {
    await register(ctx.app, "ada@example.com");
    const res = await request(ctx.app).post("/auth/register").send({ email: "ADA@example.com", password: PASSWORD });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("EMAIL_TAKEN");
  });

  it("rejects short passwords with 400", async () => {
    const res = await request(ctx.app).post("/auth/register").send({ email: "ada@example.com", password: "short" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });
});

describe("TODO(3,4) · POST /auth/login", () => {
  it("sets an HttpOnly, SameSite=Lax session cookie and returns the user", async () => {
    await register(ctx.app, "ada@example.com");
    const res = await request(ctx.app).post("/auth/login").send({ email: "ADA@example.com", password: PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ email: "ada@example.com", role: "user" });
    expect(JSON.stringify(res.body)).not.toMatch(/password|hash|scrypt/i);
    const setCookie = String(res.headers["set-cookie"]);
    expect(setCookie).toMatch(/^sid=[A-Za-z0-9_-]{43,}/);
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("SameSite=Lax");
    expect(setCookie).toContain("Max-Age=3600");
  });

  it("stores the session in Redis under the wl:22: prefix", async () => {
    await register(ctx.app, "ada@example.com");
    const cookie = await login(ctx.app, "ada@example.com");
    const sid = cookie.slice("sid=".length);
    expect(await ctx.redis.exists(`wl:22:session:${sid}`)).toBe(1);
  });

  it("does not reveal whether the email exists (same status and body)", async () => {
    await register(ctx.app, "ada@example.com");
    const wrongPassword = await request(ctx.app)
      .post("/auth/login")
      .send({ email: "ada@example.com", password: "not the password" });
    const unknownEmail = await request(ctx.app)
      .post("/auth/login")
      .send({ email: "nobody@example.com", password: "not the password" });
    expect(wrongPassword.status).toBe(401);
    expect(unknownEmail.status).toBe(401);
    expect(wrongPassword.body).toEqual(unknownEmail.body);
    expect(wrongPassword.body.error.code).toBe("INVALID_CREDENTIALS");
    expect(sessionCookieFrom(wrongPassword)).toBeUndefined();
  });

  it("still runs the password hasher for unknown emails (no timing shortcut)", async () => {
    const original = ctx.container.authService;
    // Spy on the hasher the service was built with.
    const deps = (original as unknown as { deps: { hasher: { verify: (...a: string[]) => Promise<boolean> } } }).deps;
    expect(deps?.hasher?.verify, "AuthService should keep its deps in `this.deps`").toBeTypeOf("function");
    const realVerify = deps.hasher.verify;
    let calls = 0;
    deps.hasher.verify = async (...args: string[]) => {
      calls++;
      return realVerify(...args);
    };
    try {
      const res = await request(ctx.app).post("/auth/login").send({ email: "ghost@example.com", password: "whatever-123" });
      expect(res.status).toBe(401);
      expect(calls, "verify() should be called against a dummy hash when the user doesn't exist").toBe(1);
    } finally {
      deps.hasher.verify = realVerify;
    }
  });

  it("rotates the session id on login (session fixation defense)", async () => {
    await register(ctx.app, "ada@example.com");
    const first = await login(ctx.app, "ada@example.com");
    const res = await request(ctx.app)
      .post("/auth/login")
      .set("Cookie", first)
      .send({ email: "ada@example.com", password: PASSWORD });
    expect(res.status).toBe(200);
    const second = sessionCookieFrom(res);
    expect(second).toBeDefined();
    expect(second).not.toBe(first);
    expect((await request(ctx.app).get("/auth/me").set("Cookie", first)).status, "old session must be dead").toBe(401);
    expect((await request(ctx.app).get("/auth/me").set("Cookie", second!)).status).toBe(200);
  });
});

describe("TODO(5a) · GET /auth/me", () => {
  it("returns 401 UNAUTHENTICATED without a cookie or with a bogus one", async () => {
    const none = await request(ctx.app).get("/auth/me");
    expect(none.status).toBe(401);
    expect(none.body.error.code).toBe("UNAUTHENTICATED");
    const bogus = await request(ctx.app).get("/auth/me").set("Cookie", "sid=made-up-session-id");
    expect(bogus.status).toBe(401);
  });

  it("returns the current user with a valid session", async () => {
    const { cookie } = await registerAndLogin(ctx.app, "ada@example.com");
    const res = await request(ctx.app).get("/auth/me").set("Cookie", cookie);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ email: "ada@example.com", role: "user" });
  });

  it("reflects role changes immediately (user is loaded per request, not cached in the session)", async () => {
    const { cookie, user } = await registerAndLogin(ctx.app, "ada@example.com");
    await ctx.pool.query("UPDATE users SET role = 'admin' WHERE id = $1", [user.id]);
    const res = await request(ctx.app).get("/auth/me").set("Cookie", cookie);
    expect(res.body.data.role).toBe("admin");
  });

  it("treats a session whose user was deleted as anonymous, and destroys it", async () => {
    const { cookie, user } = await registerAndLogin(ctx.app, "ada@example.com");
    await ctx.pool.query("DELETE FROM users WHERE id = $1", [user.id]);
    expect((await request(ctx.app).get("/auth/me").set("Cookie", cookie)).status).toBe(401);
    const sid = cookie.slice("sid=".length);
    expect(await ctx.redis.exists(`wl:22:session:${sid}`)).toBe(0);
  });
});

describe("TODO(4) · logout", () => {
  it("POST /auth/logout destroys the session and clears the cookie", async () => {
    const { cookie } = await registerAndLogin(ctx.app, "ada@example.com");
    const res = await request(ctx.app).post("/auth/logout").set("Cookie", cookie);
    expect(res.status).toBe(204);
    expect(String(res.headers["set-cookie"])).toMatch(/^sid=;.*Max-Age=0/);
    expect((await request(ctx.app).get("/auth/me").set("Cookie", cookie)).status).toBe(401);
  });

  it("POST /auth/logout-all ends every session of the user", async () => {
    await register(ctx.app, "ada@example.com");
    const laptop = await login(ctx.app, "ada@example.com");
    const phone = await login(ctx.app, "ada@example.com");
    const res = await request(ctx.app).post("/auth/logout-all").set("Cookie", laptop);
    expect(res.status).toBe(204);
    expect((await request(ctx.app).get("/auth/me").set("Cookie", laptop)).status).toBe(401);
    expect((await request(ctx.app).get("/auth/me").set("Cookie", phone)).status).toBe(401);
  });
});

describe("TODO(5b) · RBAC: GET /admin/users", () => {
  it("is 401 for anonymous callers", async () => {
    const res = await request(ctx.app).get("/admin/users");
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHENTICATED");
  });

  it("is 403 FORBIDDEN for regular users", async () => {
    const { cookie } = await registerAndLogin(ctx.app, "ada@example.com");
    const res = await request(ctx.app).get("/admin/users").set("Cookie", cookie);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
  });

  it("lists users for admins, without password hashes", async () => {
    await register(ctx.app, "ada@example.com");
    const adminCookie = await createAdmin(ctx, "root@example.com");
    const res = await request(ctx.app).get("/admin/users").set("Cookie", adminCookie);
    expect(res.status).toBe(200);
    expect(res.body.data.map((u: { email: string }) => u.email).sort()).toEqual(["ada@example.com", "root@example.com"]);
    expect(JSON.stringify(res.body)).not.toMatch(/password|hash|scrypt/i);
  });
});
