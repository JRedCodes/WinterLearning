import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PermanentError } from "../src/consumers/errors.js";
import { upcastOrderPlaced } from "../src/events/upcasters.js";
import { createHarness, freshState, orderPlacedRecord, orderPlacedV1Record, paymentsFor, type Harness } from "./helpers/harness.js";

/** Symptom 4: payments choke on orders placed before the v2 rollout. */
const v1 = {
  eventId: "evt-old",
  occurredAt: "2025-12-01T09:00:00.000Z",
  orderId: "order-old",
  customerId: "cust-1",
  totalCents: 3600,
};
const v2 = {
  eventId: "evt-new",
  occurredAt: "2026-01-15T10:00:00.000Z",
  orderId: "order-new",
  customerId: "cust-1",
  total: { amountCents: 1200, currency: "USD" },
};

describe("upcastOrderPlaced", () => {
  it("upcasts v1 (flat totalCents, implicitly EUR) to the v2 shape", () => {
    expect(upcastOrderPlaced("1", v1)).toEqual({
      eventId: "evt-old",
      occurredAt: "2025-12-01T09:00:00.000Z",
      orderId: "order-old",
      customerId: "cust-1",
      total: { amountCents: 3600, currency: "EUR" },
    });
  });

  it("passes v2 through (validated)", () => {
    expect(upcastOrderPlaced("2", v2)).toEqual(v2);
  });

  it("rejects versions it doesn't know with a PermanentError (retrying can't help)", () => {
    expect(() => upcastOrderPlaced("3", v2)).toThrow(PermanentError);
    expect(() => upcastOrderPlaced(undefined, v2)).toThrow(PermanentError);
  });

  it("rejects payloads that don't match their declared version with a PermanentError", () => {
    expect(() => upcastOrderPlaced("1", { ...v1, totalCents: "36.00" })).toThrow(PermanentError);
    expect(() => upcastOrderPlaced("2", v1)).toThrow(PermanentError);
  });
});

describe("payments consumer: old and new events", () => {
  let h: Harness;
  beforeAll(() => {
    h = createHarness();
  });
  afterAll(async () => {
    await h.close();
  });
  beforeEach(async () => {
    await freshState(h);
  });

  const OLD = "11111111-1111-4111-8111-111111111111";
  const NEW = "22222222-2222-4222-8222-222222222222";

  it("charges the right amount for a v1 event still in the topic", async () => {
    await h.container.payments.handle(orderPlacedV1Record({ eventId: "evt-old", orderId: OLD, totalCents: 3600 }));
    expect(await paymentsFor(h, OLD)).toMatchObject([{ amount_cents: 3600, currency: "EUR" }]);
  });

  it("handles a mix of v1 and v2 events", async () => {
    await h.container.payments.handle(orderPlacedV1Record({ eventId: "evt-old", orderId: OLD, totalCents: 3600 }));
    await h.container.payments.handle(orderPlacedRecord({ eventId: "evt-new", orderId: NEW, amountCents: 1200, currency: "USD" }));
    expect(await paymentsFor(h, OLD)).toMatchObject([{ amount_cents: 3600, currency: "EUR" }]);
    expect(await paymentsFor(h, NEW)).toMatchObject([{ amount_cents: 1200, currency: "USD" }]);
  });

  it("fails with a PermanentError for an unknown version or malformed JSON (so it's dead-lettered, not retried)", async () => {
    const future = { ...orderPlacedRecord({ eventId: "evt-f", orderId: NEW }), headers: { "event-type": "OrderPlaced", "event-version": "3" } };
    await expect(h.container.payments.handle(future)).rejects.toBeInstanceOf(PermanentError);
    const garbage = { ...orderPlacedRecord({ eventId: "evt-g", orderId: NEW }), value: "{oops" };
    await expect(h.container.payments.handle(garbage)).rejects.toBeInstanceOf(PermanentError);
    expect(await paymentsFor(h, NEW)).toHaveLength(0);
  });
});
