import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { NotificationWorker } from "../src/container.js";
import type { BookingConfirmedEvent, DomainEvent } from "../src/messaging/eventPublisher.js";
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
  type TestContext,
} from "./helpers/context.js";
import { sleep, waitFor } from "./helpers/fakes.js";

function confirmedEvent(overrides: Partial<BookingConfirmedEvent["payload"]> = {}): BookingConfirmedEvent {
  return {
    id: randomUUID(),
    type: "booking.confirmed",
    version: 1,
    key: "event-1",
    occurredAt: START.toISOString(),
    payload: {
      bookingId: randomUUID(),
      eventId: "event-1",
      eventName: "Queue Fest",
      userId: randomUUID(),
      userEmail: "fan@example.com",
      seats: ["C3", "C4"],
      totalCents: 9000,
      ...overrides,
    },
  };
}

describe("M4 · notifications consumer + queue (BullMQ)", () => {
  let ctx: TestContext;
  let worker: NotificationWorker | undefined;

  beforeAll(async () => {
    ctx = await createTestContext();
  });
  beforeEach(async () => {
    await resetState(ctx);
  });
  afterEach(async () => {
    await worker?.close();
    worker = undefined;
  });
  afterAll(async () => {
    await closeTestContext(ctx);
  });

  it("sends one confirmation email per booking.confirmed event, even if the event is delivered twice", async () => {
    const event = confirmedEvent();
    await ctx.container.notifications.handle(event);
    await ctx.container.notifications.handle(event); // Kafka redelivery after a consumer crash

    worker = ctx.container.notifications.startWorker();
    await waitFor(() => ctx.emailSender.sent.length >= 1, "the confirmation email");
    await sleep(300); // give a duplicate the chance to show up
    expect(ctx.emailSender.sent).toHaveLength(1);
    const email = ctx.emailSender.sent[0]!;
    expect(email.to).toBe("fan@example.com");
    expect(email.subject).toContain("Queue Fest");
    expect(email.text).toContain("C3");
    expect(email.text).toContain("C4");
  });

  it("ignores event types it doesn't care about", async () => {
    const other: DomainEvent = { ...confirmedEvent(), type: "seat.repainted" };
    await ctx.container.notifications.handle(other);
    worker = ctx.container.notifications.startWorker();
    await sleep(300);
    expect(ctx.emailSender.attempts).toBe(0);
  });

  it("retries a failing email provider with backoff until it succeeds", async () => {
    ctx.emailSender.failNext(2);
    await ctx.container.notifications.handle(confirmedEvent());
    worker = ctx.container.notifications.startWorker();
    await waitFor(() => ctx.emailSender.sent.length === 1, "the email after two failures");
    expect(ctx.emailSender.attempts).toBe(3);
  });

  it("end to end: booking -> outbox -> relay -> consumer -> queue -> email", async () => {
    const organizer = await signUp(ctx.app, ORGANIZER);
    const show = await createEvent(ctx.app, organizer, { name: "End To End" });
    const fan = await signUp(ctx.app, "e2e@example.com");
    const hold = await holdOk(ctx.app, fan, show.id, ["B2"]);
    expect((await book(ctx.app, fan, hold.id)).status).toBe(201);

    await ctx.container.outboxRelay.runOnce();
    for (const e of ctx.publisher.published) await ctx.container.notifications.handle(e);

    worker = ctx.container.notifications.startWorker();
    await waitFor(() => ctx.emailSender.sent.length === 1, "the booking confirmation email");
    expect(ctx.emailSender.sent[0]).toMatchObject({ to: "e2e@example.com" });
    expect(ctx.emailSender.sent[0]!.subject).toContain("End To End");
  });
});
