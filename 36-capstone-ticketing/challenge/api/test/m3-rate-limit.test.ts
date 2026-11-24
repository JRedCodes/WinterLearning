import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  closeTestContext,
  createEvent,
  createTestContext,
  holdSeats,
  ORGANIZER,
  PASSWORD,
  register,
  resetState,
  signUp,
  type TestContext,
} from "./helpers/context.js";

describe("M3 · rate limiting (Redis, fixed window, injected clock)", () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestContext({
      LOGIN_RATE_LIMIT: "3",
      LOGIN_RATE_WINDOW_SECONDS: "60",
      HOLD_RATE_LIMIT: "4",
      HOLD_RATE_WINDOW_SECONDS: "60",
    });
  });
  beforeEach(async () => {
    await resetState(ctx);
  });
  afterAll(async () => {
    await closeTestContext(ctx);
  });

  const attempt = (email: string, password = "wrong password!") =>
    request(ctx.app).post("/auth/login").send({ email, password });

  describe("POST /auth/login (per client IP + email)", () => {
    it("allows LOGIN_RATE_LIMIT attempts per window, then answers 429 RATE_LIMITED with Retry-After", async () => {
      await register(ctx.app, "target@example.com");
      const first = await attempt("target@example.com");
      expect(first.status).toBe(401);
      expect(first.headers["ratelimit-limit"]).toBe("3");
      expect(first.headers["ratelimit-remaining"]).toBe("2");
      await attempt("target@example.com");
      await attempt("target@example.com");

      const blocked = await attempt("target@example.com", PASSWORD); // even the right password
      expect(blocked.status).toBe(429);
      expect(blocked.body.error.code).toBe("RATE_LIMITED");
      expect(blocked.headers["ratelimit-remaining"]).toBe("0");
      const retryAfter = Number(blocked.headers["retry-after"]);
      expect(retryAfter).toBeGreaterThan(0);
      expect(retryAfter).toBeLessThanOrEqual(60);
    });

    it("counts each email separately", async () => {
      await register(ctx.app, "victim@example.com");
      await register(ctx.app, "bystander@example.com");
      for (let i = 0; i < 4; i++) await attempt("victim@example.com");
      const other = await attempt("bystander@example.com", PASSWORD);
      expect(other.status).toBe(200);
    });

    it("lets the client back in once the window has passed (by the injected clock)", async () => {
      await register(ctx.app, "patient@example.com");
      for (let i = 0; i < 4; i++) await attempt("patient@example.com");
      expect((await attempt("patient@example.com", PASSWORD)).status).toBe(429);
      ctx.clock.advance(60_000);
      expect((await attempt("patient@example.com", PASSWORD)).status).toBe(200);
    });
  });

  describe("POST /events/:id/holds (per user)", () => {
    it("limits hold attempts per user, failed attempts included; other users are unaffected", async () => {
      const organizer = await signUp(ctx.app, ORGANIZER);
      const event = await createEvent(ctx.app, organizer, { rows: 1, seatsPerRow: 10 });
      const greedy = await signUp(ctx.app, "greedy@example.com");
      const polite = await signUp(ctx.app, "polite@example.com");

      const statuses: number[] = [];
      for (const seat of ["A1", "A2", "Z9", "A3"]) statuses.push((await holdSeats(ctx.app, greedy, event.id, [seat])).status);
      expect(statuses).toEqual([201, 201, 404, 201]);

      const fifth = await holdSeats(ctx.app, greedy, event.id, ["A4"]);
      expect(fifth.status).toBe(429);
      expect(fifth.body.error.code).toBe("RATE_LIMITED");
      expect(Number(fifth.headers["retry-after"])).toBeGreaterThan(0);

      expect((await holdSeats(ctx.app, polite, event.id, ["A4"])).status).toBe(201);
      ctx.clock.advance(60_000);
      expect((await holdSeats(ctx.app, greedy, event.id, ["A5"])).status).toBe(201);
    });
  });
});
