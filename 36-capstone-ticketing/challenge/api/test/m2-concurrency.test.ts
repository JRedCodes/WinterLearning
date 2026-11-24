import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  book,
  closeTestContext,
  countStatuses,
  createEvent,
  createTestContext,
  holdOk,
  holdSeats,
  ORGANIZER,
  resetState,
  signUp,
  type EventBody,
  type Session,
  type TestContext,
} from "./helpers/context.js";

/**
 * The invariant the whole capstone is built around: a seat is sold at most once,
 * no matter how many requests arrive at the same moment.
 */
describe("M2 · no double booking under concurrency", () => {
  let ctx: TestContext;
  let organizer: Session;
  let event: EventBody;

  beforeAll(async () => {
    ctx = await createTestContext({ DB_POOL_MAX: "10" });
  });
  beforeEach(async () => {
    await resetState(ctx);
    organizer = await signUp(ctx.app, ORGANIZER);
    event = await createEvent(ctx.app, organizer, { rows: 1, seatsPerRow: 10 });
  });
  afterAll(async () => {
    await closeTestContext(ctx);
  });

  async function sales() {
    const res = await request(ctx.app).get(`/events/${event.id}/sales`).set(organizer.auth);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    return res.body.data as { bookings: number; seatsSold: number };
  }

  it("50 fans racing for the same seat: exactly 1 booking", async () => {
    const fans = await Promise.all(Array.from({ length: 50 }, (_, i) => signUp(ctx.app, `fan${i}@example.com`)));

    const outcomes = await Promise.all(
      fans.map(async (fan) => {
        const hold = await holdSeats(ctx.app, fan, event.id, ["A5"]);
        if (hold.status !== 201) return { hold: hold.status, booking: 0 };
        const booking = await book(ctx.app, fan, hold.body.data.id);
        return { hold: hold.status, booking: booking.status };
      }),
    );

    const holdCounts = countStatuses(outcomes.map((o) => ({ status: o.hold })));
    expect(holdCounts, `hold statuses ${JSON.stringify(holdCounts)}`).toEqual({ 201: 1, 409: 49 });
    expect(outcomes.filter((o) => o.booking === 201)).toHaveLength(1);
    expect(await sales()).toMatchObject({ bookings: 1, seatsSold: 1 });
  });

  it("50 concurrent booking attempts on one hold (different keys): exactly 1 succeeds", async () => {
    const fan = await signUp(ctx.app, "eager@example.com");
    const hold = await holdOk(ctx.app, fan, event.id, ["A1", "A2"]);
    const responses = await Promise.all(Array.from({ length: 50 }, (_, i) => book(ctx.app, fan, hold.id, `k-${i}`)));
    const counts = countStatuses(responses);
    expect(counts, `booking statuses ${JSON.stringify(counts)}`).toEqual({ 201: 1, 409: 49 });
    expect(await sales()).toMatchObject({ bookings: 1, seatsSold: 2 });
  });

  it("20 concurrent retries with the SAME key all get the same booking", async () => {
    const fan = await signUp(ctx.app, "retrier@example.com");
    const hold = await holdOk(ctx.app, fan, event.id, ["A3"]);
    const responses = await Promise.all(Array.from({ length: 20 }, () => book(ctx.app, fan, hold.id, "one-key")));
    const counts = countStatuses(responses);
    expect(counts, `statuses ${JSON.stringify(counts)} ${JSON.stringify(responses.find((r) => r.status !== 201)?.body)}`).toEqual({ 201: 20 });
    const ids = new Set(responses.map((r) => r.body.data.id));
    expect(ids.size, "every retry must return the same booking id").toBe(1);
    expect(await sales()).toMatchObject({ bookings: 1, seatsSold: 1 });
  });

  it("overlapping multi-seat holds in different orders never deadlock or double-hold", async () => {
    const fans = await Promise.all(Array.from({ length: 30 }, (_, i) => signUp(ctx.app, `overlap${i}@example.com`)));
    const patterns = [["A1", "A2"], ["A2", "A1"], ["A2", "A3"], ["A3", "A2"], ["A3", "A1"]];
    const responses = await Promise.all(fans.map((fan, i) => holdSeats(ctx.app, fan, event.id, patterns[i % patterns.length]!)));

    const counts = countStatuses(responses);
    const unexpected = responses.find((r) => r.status !== 201 && r.status !== 409);
    expect(unexpected?.body, `unexpected status ${unexpected?.status} (deadlock?)`).toBeUndefined();
    const heldSeats = responses.filter((r) => r.status === 201).flatMap((r) => r.body.data.seats as string[]);
    expect(new Set(heldSeats).size, `a seat was held twice: ${heldSeats.join(",")}`).toBe(heldSeats.length);
    expect(counts[201]).toBeGreaterThanOrEqual(1);
  });
});
