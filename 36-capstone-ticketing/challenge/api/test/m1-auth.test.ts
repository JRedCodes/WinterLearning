import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  closeTestContext,
  createTestContext,
  login,
  ORGANIZER,
  PASSWORD,
  register,
  resetState,
  signUp,
  type TestContext,
} from "./helpers/context.js";

describe("M1 · health, auth & error handling", () => {
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

  describe("health", () => {
    it("GET /healthz is a cheap liveness check", async () => {
      const res = await request(ctx.app).get("/healthz");
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ status: "ok" });
    });

    it("GET /readyz reports ready when Postgres and Redis answer", async () => {
      const res = await request(ctx.app).get("/readyz");
      expect(res.status, JSON.stringify(res.body)).toBe(200);
      expect(res.body.status).toBe("ready");
    });
  });

  describe("POST /auth/register", () => {
    it("creates a customer and never returns password material", async () => {
      const res = await request(ctx.app)
        .post("/auth/register")
        .send({ email: "  Ada@Example.COM ", password: PASSWORD, name: "Ada" });
      expect(res.status, JSON.stringify(res.body)).toBe(201);
      expect(res.body.data).toEqual({
        id: expect.any(String),
        email: "ada@example.com",
        name: "Ada",
        role: "customer",
      });
      expect(JSON.stringify(res.body).toLowerCase()).not.toContain("password");
      expect(JSON.stringify(res.body)).not.toContain(PASSWORD);
    });

    it("gives the organizer role to emails listed in ORGANIZER_EMAILS", async () => {
      const user = await register(ctx.app, ORGANIZER.toUpperCase());
      expect(user.role).toBe("organizer");
    });

    it("rejects invalid input with 400 VALIDATION_ERROR and per-field details", async () => {
      const res = await request(ctx.app).post("/auth/register").send({ email: "nope", password: "short", name: "" });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
      const paths = (res.body.error.details as { path: string }[]).map((d) => d.path);
      expect(paths).toEqual(expect.arrayContaining(["email", "password", "name"]));
    });

    it("rejects a duplicate email (case-insensitive) with 409 EMAIL_TAKEN", async () => {
      await register(ctx.app, "grace@example.com");
      const res = await request(ctx.app)
        .post("/auth/register")
        .send({ email: "GRACE@example.com", password: PASSWORD, name: "Grace again" });
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe("EMAIL_TAKEN");
    });
  });

  describe("login, /me and logout", () => {
    it("logs in with a bearer token that identifies the user on GET /me", async () => {
      const user = await register(ctx.app, "linus@example.com", "Linus");
      const token = await login(ctx.app, "linus@example.com");
      const me = await request(ctx.app).get("/me").set("Authorization", `Bearer ${token}`);
      expect(me.status).toBe(200);
      expect(me.body.data).toEqual(user);
    });

    it("returns the same 401 INVALID_CREDENTIALS for a wrong password and an unknown email", async () => {
      await register(ctx.app, "barbara@example.com");
      const wrongPassword = await request(ctx.app)
        .post("/auth/login")
        .send({ email: "barbara@example.com", password: "not the password" });
      const unknownEmail = await request(ctx.app)
        .post("/auth/login")
        .send({ email: "nobody@example.com", password: PASSWORD });
      expect(wrongPassword.status).toBe(401);
      expect(unknownEmail.status).toBe(401);
      expect(wrongPassword.body.error.code).toBe("INVALID_CREDENTIALS");
      expect(unknownEmail.body.error).toEqual(wrongPassword.body.error);
    });

    it("rejects missing or unknown tokens with 401 UNAUTHENTICATED", async () => {
      const none = await request(ctx.app).get("/me");
      const bogus = await request(ctx.app).get("/me").set("Authorization", "Bearer not-a-real-token");
      expect(none.status).toBe(401);
      expect(none.body.error.code).toBe("UNAUTHENTICATED");
      expect(bogus.status).toBe(401);
    });

    it("logout revokes the token immediately", async () => {
      const s = await signUp(ctx.app, "ken@example.com");
      const out = await request(ctx.app).post("/auth/logout").set(s.auth);
      expect(out.status).toBe(204);
      const me = await request(ctx.app).get("/me").set(s.auth);
      expect(me.status, "a logged-out token must stop working").toBe(401);
    });
  });

  describe("error handling", () => {
    it("unknown routes return JSON 404 ROUTE_NOT_FOUND", async () => {
      const res = await request(ctx.app).get("/definitely-not-here");
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe("ROUTE_NOT_FOUND");
    });

    it("malformed JSON returns 400 INVALID_JSON, not 500", async () => {
      const res = await request(ctx.app)
        .post("/auth/register")
        .set("Content-Type", "application/json")
        .send('{"email": ');
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("INVALID_JSON");
    });
  });
});
