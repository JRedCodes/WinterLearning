import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  closeTestContext,
  createEvent,
  createTestContext,
  holdOk,
  holdSeats,
  ORGANIZER,
  resetState,
  seatStatuses,
  signUp,
  START,
  type EventBody,
  type Session,
  type TestContext,
} from "./helpers/context.js";

const TEN_MINUTES = 600_000;

describe("M2 · seat holds", () => {
  let ctx: TestContext;
  let event: EventBody;
  let alice: Session;
  let bob: Session;

  beforeAll(async () => {
    ctx = await createTestContext();
  });
  beforeEach(async () => {
    await resetState(ctx);
    const organizer = await signUp(ctx.app, ORGANIZER);
    event = await createEvent(ctx.app, organizer);
    alice = await signUp(ctx.app, "alice@example.com", "Alice");
    bob = await signUp(ctx.app, "bob@example.com", "Bob");
  });
  afterAll(async () => {
    await closeTestContext(ctx);
  });

  it("holds seats for HOLD_TTL_SECONDS (by the injected clock) and shows them as held", async () => {
    const res = await holdSeats(ctx.app, alice, event.id, ["A2", "A1"]);
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.data).toEqual({
      id: expect.any(String),
      eventId: event.id,
      seats: ["A1", "A2"],
      expiresAt: new Date(START.getTime() + TEN_MINUTES).toISOString(),
      status: "active",
    });
    const seats = await seatStatuses(ctx.app, event.id);
    expect(seats.A1).toBe("held");
    expect(seats.A2).toBe("held");
    expect(seats.A3).toBe("available");
  });

  it("is all-or-nothing: if one seat is taken, none are held (409 SEAT_UNAVAILABLE)", async () => {
    await holdOk(ctx.app, alice, event.id, ["A2"]);
    const res = await holdSeats(ctx.app, bob, event.id, ["A3", "A2"]);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("SEAT_UNAVAILABLE");
    const seats = await seatStatuses(ctx.app, event.id);
    expect(seats.A3, "A3 must not stay held after a failed hold").toBe("available");
  });

  it("returns 404 SEAT_NOT_FOUND for seats that don't exist and 404 NOT_FOUND for unknown events", async () => {
    const badSeat = await holdSeats(ctx.app, alice, event.id, ["A1", "Z99"]);
    expect(badSeat.status).toBe(404);
    expect(badSeat.body.error.code).toBe("SEAT_NOT_FOUND");
    const badEvent = await holdSeats(ctx.app, alice, randomUUID(), ["A1"]);
    expect(badEvent.status).toBe(404);
    expect(badEvent.body.error.code).toBe("NOT_FOUND");
    expect((await seatStatuses(ctx.app, event.id)).A1).toBe("available");
  });

  it("validates the seat list: 1..MAX_SEATS_PER_HOLD unique labels", async () => {
    const empty = await holdSeats(ctx.app, alice, event.id, []);
    const tooMany = await holdSeats(ctx.app, alice, event.id, ["A1", "A2", "A3", "A4", "A5", "B1", "B2"]);
    const dupes = await holdSeats(ctx.app, alice, event.id, ["A1", "A1"]);
    for (const res of [empty, tooMany, dupes]) {
      expect(res.status, JSON.stringify(res.body)).toBe(400);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    }
  });

  it("requires authentication", async () => {
    const res = await request(ctx.app).post(`/events/${event.id}/holds`).send({ seats: ["A1"] });
    expect(res.status).toBe(401);
  });

  it("expired holds free their seats for others without any background job", async () => {
    await holdOk(ctx.app, alice, event.id, ["A1"]);
    ctx.clock.advance(TEN_MINUTES - 1_000);
    expect((await holdSeats(ctx.app, bob, event.id, ["A1"])).status, "still held 1s before expiry").toBe(409);
    ctx.clock.advance(2_000);
    expect((await seatStatuses(ctx.app, event.id)).A1).toBe("available");
    const res = await holdSeats(ctx.app, bob, event.id, ["A1"]);
    expect(res.status, JSON.stringify(res.body)).toBe(201);
  });

  describe("GET /holds/:id", () => {
    it("shows the owner their hold, and its status changes to expired", async () => {
      const hold = await holdOk(ctx.app, alice, event.id, ["B1"]);
      const res = await request(ctx.app).get(`/holds/${hold.id}`).set(alice.auth);
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual(hold);
      ctx.clock.advance(TEN_MINUTES + 1);
      const later = await request(ctx.app).get(`/holds/${hold.id}`).set(alice.auth);
      expect(later.body.data.status).toBe("expired");
    });

    it("is 404 for someone else's hold (don't reveal it exists)", async () => {
      const hold = await holdOk(ctx.app, alice, event.id, ["B1"]);
      const res = await request(ctx.app).get(`/holds/${hold.id}`).set(bob.auth);
      expect(res.status).toBe(404);
    });
  });

  describe("DELETE /holds/:id", () => {
    it("releases the seats", async () => {
      const hold = await holdOk(ctx.app, alice, event.id, ["A1", "A2"]);
      const res = await request(ctx.app).delete(`/holds/${hold.id}`).set(alice.auth);
      expect(res.status).toBe(204);
      const seats = await seatStatuses(ctx.app, event.id);
      expect([seats.A1, seats.A2]).toEqual(["available", "available"]);
      const after = await request(ctx.app).get(`/holds/${hold.id}`).set(alice.auth);
      expect(after.body.data.status).toBe("released");
    });

    it("is 404 for another user and 409 HOLD_NOT_ACTIVE when already released", async () => {
      const hold = await holdOk(ctx.app, alice, event.id, ["A1"]);
      expect((await request(ctx.app).delete(`/holds/${hold.id}`).set(bob.auth)).status).toBe(404);
      expect((await request(ctx.app).delete(`/holds/${hold.id}`).set(alice.auth)).status).toBe(204);
      const again = await request(ctx.app).delete(`/holds/${hold.id}`).set(alice.auth);
      expect(again.status).toBe(409);
      expect(again.body.error.code).toBe("HOLD_NOT_ACTIVE");
    });
  });
});
