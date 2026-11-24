import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  book,
  closeTestContext,
  createEvent,
  createTestContext,
  holdOk,
  holdSeats,
  ORGANIZER,
  resetState,
  seatStatuses,
  signUp,
  type EventBody,
  type Session,
  type TestContext,
} from "./helpers/context.js";

describe("M2 · bookings & idempotency", () => {
  let ctx: TestContext;
  let organizer: Session;
  let event: EventBody;
  let alice: Session;
  let bob: Session;

  beforeAll(async () => {
    ctx = await createTestContext();
  });
  beforeEach(async () => {
    await resetState(ctx);
    organizer = await signUp(ctx.app, ORGANIZER);
    event = await createEvent(ctx.app, organizer, { priceCents: 2500 });
    alice = await signUp(ctx.app, "alice@example.com", "Alice");
    bob = await signUp(ctx.app, "bob@example.com", "Bob");
  });
  afterAll(async () => {
    await closeTestContext(ctx);
  });

  it("turns an active hold into a confirmed booking", async () => {
    const hold = await holdOk(ctx.app, alice, event.id, ["A1", "A2"]);
    const res = await book(ctx.app, alice, hold.id, "key-1");
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.data).toEqual({
      id: expect.any(String),
      eventId: event.id,
      holdId: hold.id,
      seats: ["A1", "A2"],
      totalCents: 5000,
      status: "confirmed",
      createdAt: expect.any(String),
    });
    const seats = await seatStatuses(ctx.app, event.id);
    expect([seats.A1, seats.A2]).toEqual(["booked", "booked"]);
    const h = await request(ctx.app).get(`/holds/${hold.id}`).set(alice.auth);
    expect(h.body.data.status).toBe("converted");
  });

  it("requires an Idempotency-Key header (400 IDEMPOTENCY_KEY_REQUIRED)", async () => {
    const hold = await holdOk(ctx.app, alice, event.id, ["A1"]);
    const res = await request(ctx.app).post("/bookings").set(alice.auth).send({ holdId: hold.id });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("IDEMPOTENCY_KEY_REQUIRED");
  });

  it("replays the original response for a retried request with the same key", async () => {
    const hold = await holdOk(ctx.app, alice, event.id, ["A1"]);
    const first = await book(ctx.app, alice, hold.id, "retry-me");
    const second = await book(ctx.app, alice, hold.id, "retry-me");
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(second.body).toEqual(first.body);
    expect(second.headers["idempotent-replayed"]).toBe("true");
    const mine = await request(ctx.app).get("/bookings").set(alice.auth);
    expect(mine.body.data, "a retry must not create a second booking").toHaveLength(1);
  });

  it("rejects reusing a key for a different request (422 IDEMPOTENCY_KEY_REUSED)", async () => {
    const h1 = await holdOk(ctx.app, alice, event.id, ["A1"]);
    const h2 = await holdOk(ctx.app, alice, event.id, ["A2"]);
    expect((await book(ctx.app, alice, h1.id, "same-key")).status).toBe(201);
    const res = await book(ctx.app, alice, h2.id, "same-key");
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("IDEMPOTENCY_KEY_REUSED");
  });

  it("scopes idempotency keys per user", async () => {
    const h1 = await holdOk(ctx.app, alice, event.id, ["A1"]);
    const h2 = await holdOk(ctx.app, bob, event.id, ["A2"]);
    const a = await book(ctx.app, alice, h1.id, "shared-key");
    const b = await book(ctx.app, bob, h2.id, "shared-key");
    expect(a.status).toBe(201);
    expect(b.status, JSON.stringify(b.body)).toBe(201);
    expect(b.body.data.id).not.toBe(a.body.data.id);
  });

  it("refuses an expired hold with 409 HOLD_EXPIRED", async () => {
    const hold = await holdOk(ctx.app, alice, event.id, ["A1"]);
    ctx.clock.advance(600_001);
    const res = await book(ctx.app, alice, hold.id);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("HOLD_EXPIRED");
    expect((await seatStatuses(ctx.app, event.id)).A1).toBe("available");
  });

  it("refuses released or already-booked holds with 409 HOLD_NOT_ACTIVE", async () => {
    const released = await holdOk(ctx.app, alice, event.id, ["A1"]);
    await request(ctx.app).delete(`/holds/${released.id}`).set(alice.auth);
    const r1 = await book(ctx.app, alice, released.id);
    expect(r1.status).toBe(409);
    expect(r1.body.error.code).toBe("HOLD_NOT_ACTIVE");

    const used = await holdOk(ctx.app, alice, event.id, ["A2"]);
    expect((await book(ctx.app, alice, used.id, "k1")).status).toBe(201);
    const r2 = await book(ctx.app, alice, used.id, "k2");
    expect(r2.status).toBe(409);
    expect(r2.body.error.code).toBe("HOLD_NOT_ACTIVE");
  });

  it("is 404 when booking someone else's hold", async () => {
    const hold = await holdOk(ctx.app, alice, event.id, ["A1"]);
    const res = await book(ctx.app, bob, hold.id);
    expect(res.status).toBe(404);
  });

  it("booked seats can't be held again", async () => {
    const hold = await holdOk(ctx.app, alice, event.id, ["A1"]);
    await book(ctx.app, alice, hold.id);
    ctx.clock.advance(3_600_000); // long after the hold would have expired
    const res = await holdSeats(ctx.app, bob, event.id, ["A1"]);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("SEAT_UNAVAILABLE");
  });

  describe("reading bookings", () => {
    it("GET /bookings lists only the caller's bookings; GET /bookings/:id is owner-only (404 otherwise)", async () => {
      const ha = await holdOk(ctx.app, alice, event.id, ["A1"]);
      const hb = await holdOk(ctx.app, bob, event.id, ["B1"]);
      const a = (await book(ctx.app, alice, ha.id)).body.data;
      await book(ctx.app, bob, hb.id);

      const mine = await request(ctx.app).get("/bookings").set(alice.auth);
      expect(mine.status).toBe(200);
      expect(mine.body.data).toEqual([a]);

      expect((await request(ctx.app).get(`/bookings/${a.id}`).set(alice.auth)).body.data).toEqual(a);
      expect((await request(ctx.app).get(`/bookings/${a.id}`).set(bob.auth)).status).toBe(404);
    });

    it("GET /events/:id/sales gives the owning organizer live numbers (403 for customers)", async () => {
      const h1 = await holdOk(ctx.app, alice, event.id, ["A1", "A2"]);
      await book(ctx.app, alice, h1.id);
      await holdOk(ctx.app, bob, event.id, ["B5"]);

      const res = await request(ctx.app).get(`/events/${event.id}/sales`).set(organizer.auth);
      expect(res.status, JSON.stringify(res.body)).toBe(200);
      expect(res.body.data).toEqual({
        eventId: event.id,
        bookings: 1,
        seatsSold: 2,
        seatsHeld: 1,
        seatsAvailable: 7,
        revenueCents: 5000,
      });
      expect((await request(ctx.app).get(`/events/${event.id}/sales`).set(alice.auth)).status).toBe(403);
    });
  });
});
