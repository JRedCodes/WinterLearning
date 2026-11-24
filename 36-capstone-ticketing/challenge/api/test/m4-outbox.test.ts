import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  book,
  closeTestContext,
  createEvent,
  createTestContext,
  holdOk,
  ORGANIZER,
  resetState,
  signUp,
  START,
  type EventBody,
  type Session,
  type TestContext,
} from "./helpers/context.js";

describe("M4 · transactional outbox + relay (EventPublisher port)", () => {
  let ctx: TestContext;
  let event: EventBody;
  let alice: Session;

  beforeAll(async () => {
    ctx = await createTestContext();
  });
  beforeEach(async () => {
    await resetState(ctx);
    const organizer = await signUp(ctx.app, ORGANIZER);
    event = await createEvent(ctx.app, organizer, { name: "Outbox Live", rows: 2, seatsPerRow: 5, priceCents: 1500 });
    alice = await signUp(ctx.app, "alice@example.com", "Alice");
  });
  afterAll(async () => {
    await closeTestContext(ctx);
  });

  async function bookSeats(seats: string[]) {
    const hold = await holdOk(ctx.app, alice, event.id, seats);
    const res = await book(ctx.app, alice, hold.id);
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    return res.body.data as { id: string };
  }

  it("a booking does not publish directly; the relay publishes a booking.confirmed event", async () => {
    const booking = await bookSeats(["A2", "A1"]);
    expect(ctx.publisher.calls, "the request path must not call the publisher (dual write!)").toBe(0);

    const run = await ctx.container.outboxRelay.runOnce();
    expect(run).toEqual({ published: 1, failed: 0 });
    expect(ctx.publisher.published).toEqual([
      {
        id: expect.stringMatching(/^[0-9a-f-]{36}$/),
        type: "booking.confirmed",
        version: 1,
        key: event.id,
        occurredAt: START.toISOString(),
        payload: {
          bookingId: booking.id,
          eventId: event.id,
          eventName: "Outbox Live",
          userId: alice.user.id,
          userEmail: "alice@example.com",
          seats: ["A1", "A2"],
          totalCents: 3000,
        },
      },
    ]);
  });

  it("publishes each event once: a second run finds nothing to do", async () => {
    await bookSeats(["A1"]);
    await ctx.container.outboxRelay.runOnce();
    expect(await ctx.container.outboxRelay.runOnce()).toEqual({ published: 0, failed: 0 });
    expect(ctx.publisher.published).toHaveLength(1);
  });

  it("bookings keep working while the broker is down, and nothing is lost", async () => {
    ctx.publisher.failAlways = true;
    await bookSeats(["A1"]); // must still succeed: the API never needs Kafka

    expect(await ctx.container.outboxRelay.runOnce()).toEqual({ published: 0, failed: 1 });
    expect(await ctx.container.outboxRelay.runOnce()).toEqual({ published: 0, failed: 1 });

    ctx.publisher.failAlways = false;
    expect(await ctx.container.outboxRelay.runOnce()).toEqual({ published: 1, failed: 0 });
    expect(ctx.publisher.published.map((e) => e.type)).toEqual(["booking.confirmed"]);
  });

  it("publishes events in the order they were committed", async () => {
    const b1 = await bookSeats(["A1"]);
    const b2 = await bookSeats(["A2"]);
    const b3 = await bookSeats(["A3"]);
    await ctx.container.outboxRelay.runOnce();
    expect(ctx.publisher.published.map((e) => (e.payload as { bookingId: string }).bookingId)).toEqual([
      b1.id,
      b2.id,
      b3.id,
    ]);
  });

  it("relays running concurrently (e.g. two worker pods) never publish the same event twice", async () => {
    for (const seat of ["A1", "A2", "A3", "A4", "A5", "B1"]) await bookSeats([seat]);
    ctx.publisher.delayMs = 50; // keep each relay's batch "in flight" long enough to overlap

    const runs = await Promise.all([
      ctx.container.outboxRelay.runOnce(),
      ctx.container.outboxRelay.runOnce(),
      ctx.container.outboxRelay.runOnce(),
    ]);
    const total = runs.reduce((sum, r) => sum + r.published, 0);
    expect(total).toBe(6);
    const ids = ctx.publisher.published.map((e) => e.id);
    expect(new Set(ids).size, "duplicate event ids were published").toBe(6);
  });

  it("failed bookings leave nothing in the outbox (the event commits or rolls back with the booking)", async () => {
    const hold = await holdOk(ctx.app, alice, event.id, ["A1"]);
    ctx.clock.advance(600_001);
    expect((await book(ctx.app, alice, hold.id)).status).toBe(409);
    expect(await ctx.container.outboxRelay.runOnce()).toEqual({ published: 0, failed: 0 });
  });
});
