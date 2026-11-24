import { describe, expect, it } from "vitest";
import type { CustomerTotals } from "../src/domain/customerTotals.js";
import type { OrderCancelled, OrderPlaced } from "../src/domain/orderEvents.js";
import { applyEvent } from "../src/projection/applyEvent.js";

const placedEvent = (over: Partial<OrderPlaced> = {}): OrderPlaced => ({
  type: "OrderPlaced",
  eventId: "e1",
  occurredAt: "2026-01-10T12:00:00.000Z",
  orderId: "o1",
  customerId: "c1",
  totalCents: 2500,
  ...over,
});

const cancelledEvent = (over: Partial<OrderCancelled> = {}): OrderCancelled => ({
  type: "OrderCancelled",
  eventId: "e2",
  occurredAt: "2026-01-11T12:00:00.000Z",
  orderId: "o1",
  customerId: "c1",
  totalCents: 2500,
  reason: "changed mind",
  ...over,
});

describe("applyEvent (TODO 3)", () => {
  it("starts a new customer's totals from the first event", () => {
    expect(applyEvent(undefined, placedEvent())).toEqual({
      customerId: "c1",
      placedCount: 1,
      cancelledCount: 0,
      netTotalCents: 2500,
      lastEventAt: "2026-01-10T12:00:00.000Z",
    });
  });

  it("adds placed orders to the net total", () => {
    const one = applyEvent(undefined, placedEvent());
    const two = applyEvent(one, placedEvent({ eventId: "e3", orderId: "o2", totalCents: 1000 }));
    expect(two).toMatchObject({ placedCount: 2, cancelledCount: 0, netTotalCents: 3500 });
  });

  it("subtracts cancelled (refunded) orders from the net total", () => {
    const one = applyEvent(undefined, placedEvent());
    const two = applyEvent(one, cancelledEvent());
    expect(two).toMatchObject({ placedCount: 1, cancelledCount: 1, netTotalCents: 0, lastEventAt: "2026-01-11T12:00:00.000Z" });
  });

  it("handles a cancellation arriving for a brand-new customer", () => {
    expect(applyEvent(undefined, cancelledEvent({ totalCents: 700 }))).toMatchObject({
      placedCount: 0,
      cancelledCount: 1,
      netTotalCents: -700,
    });
  });

  it("keeps the LATEST occurredAt even when events arrive out of time order", () => {
    const later = applyEvent(undefined, placedEvent({ occurredAt: "2026-02-01T00:00:00.000Z" }));
    const next = applyEvent(later, placedEvent({ eventId: "e9", occurredAt: "2026-01-01T00:00:00.000Z" }));
    expect(next.lastEventAt).toBe("2026-02-01T00:00:00.000Z");
  });

  it("does not mutate the current totals", () => {
    const current: CustomerTotals = Object.freeze({
      customerId: "c1",
      placedCount: 1,
      cancelledCount: 0,
      netTotalCents: 100,
      lastEventAt: "2026-01-01T00:00:00.000Z",
    });
    const next = applyEvent(current, placedEvent());
    expect(next).not.toBe(current);
    expect(current.placedCount).toBe(1);
  });

  it("refuses to apply an event to another customer's totals", () => {
    const current = applyEvent(undefined, placedEvent({ customerId: "c1" }));
    expect(() => applyEvent(current, placedEvent({ customerId: "c2" }))).toThrow();
  });
});
