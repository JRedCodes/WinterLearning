import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PaymentRepository } from "../src/payments/paymentRepository.js";
import { PaymentsHandler } from "../src/payments/paymentsHandler.js";
import { ORDERS_TOPIC, createHarness, freshState, orderPlacedRecord, paymentsFor, placeOrder, type Harness } from "./helpers/harness.js";

/** Symptom 3: customers charged twice. */
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

const ORDER = "6f1c2a52-8d1e-4a59-9a43-0c1f6d1b2e01";

describe("payments consumer: idempotency", () => {
  it("charges the customer for an OrderPlaced (regression guard)", async () => {
    await h.container.payments.handle(orderPlacedRecord({ eventId: "evt-1", orderId: ORDER, amountCents: 4200 }));
    expect(await paymentsFor(h, ORDER)).toMatchObject([{ amount_cents: 4200, currency: "EUR", event_id: "evt-1" }]);
  });

  it("ignores event types it doesn't care about", async () => {
    const record = { ...orderPlacedRecord({ eventId: "evt-x", orderId: ORDER }), headers: { "event-type": "OrderShipped", "event-version": "1" } };
    await h.container.payments.handle(record);
    expect(await paymentsFor(h, ORDER)).toHaveLength(0);
  });

  it("charges only once when the same event is delivered again (redelivery after a rebalance)", async () => {
    const record = orderPlacedRecord({ eventId: "evt-1", orderId: ORDER });
    await h.container.payments.handle(record);
    await h.container.payments.handle(record);
    expect(await paymentsFor(h, ORDER), "the customer was charged twice for one event").toHaveLength(1);
  });

  it("charges only once when two deliveries of the same event race each other", async () => {
    const record = orderPlacedRecord({ eventId: "evt-1", orderId: ORDER });
    await Promise.all([h.container.payments.handle(record), h.container.payments.handle(record), h.container.payments.handle(record)]);
    expect(await paymentsFor(h, ORDER), "concurrent duplicates were both charged").toHaveLength(1);
  });

  it("remembers processed events in the inbox table", async () => {
    await h.container.payments.handle(orderPlacedRecord({ eventId: "evt-7", orderId: ORDER }));
    const rows = await h.sql<{ consumer: string; event_id: string }>("SELECT consumer, event_id FROM inbox");
    expect(rows).toEqual([{ consumer: "payments", event_id: "evt-7" }]);
  });

  it("a failed attempt doesn't mark the event as processed, so the retry still charges", async () => {
    const repo = new PaymentRepository();
    const handler = new PaymentsHandler({ pool: h.pool, payments: repo });
    vi.spyOn(repo, "insert").mockRejectedValueOnce(new Error("connection reset"));
    const record = orderPlacedRecord({ eventId: "evt-9", orderId: ORDER, amountCents: 999 });

    await expect(handler.handle(record)).rejects.toThrow("connection reset");
    await handler.handle(record);
    expect(await paymentsFor(h, ORDER), "the retry after a failure must charge exactly once").toHaveLength(1);
  });

  it("end to end: order → outbox → relay → payments (delivered twice) = one charge of the right amount", async () => {
    const order = await placeOrder(h, { customerId: "cust-5", items: [{ sku: "SKU-TEE", quantity: 3 }] });
    await h.container.relay.runOnce();
    const record = h.bus.asConsumed(ORDERS_TOPIC, 0);
    await h.container.payments.handle(record);
    await h.container.payments.handle(record);
    expect(await paymentsFor(h, order.id)).toMatchObject([{ amount_cents: 7500, currency: "EUR" }]);
  });
});
