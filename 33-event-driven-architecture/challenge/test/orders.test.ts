import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { ORDERS_TOPIC, createHarness, freshState, outboxRows, placeOrder, type Harness } from "./helpers/harness.js";

/** Symptom 1 & 2: ghost charges for failed orders, checkout down when Kafka is down. */
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

describe("placing orders (regression guard)", () => {
  it("creates the order with server-side prices: 201 + total", async () => {
    const res = await h.api().post("/orders").send({ customerId: "cust-1", items: [{ sku: "SKU-MUG", quantity: 2 }, { sku: "SKU-TEE", quantity: 1 }] });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ customerId: "cust-1", totalCents: 2 * 1200 + 2500, currency: "EUR" });
    expect(res.headers.location).toBe(`/orders/${res.body.data.id}`);
    const fetched = await h.api().get(`/orders/${res.body.data.id}`);
    expect(fetched.body.data.items).toHaveLength(2);
  });

  it("rejects unknown SKUs with 422 and creates nothing", async () => {
    const res = await h.api().post("/orders").send({ customerId: "cust-1", items: [{ sku: "SKU-NOPE", quantity: 1 }] });
    expect(res.status).toBe(422);
    expect(await h.sql("SELECT * FROM orders")).toHaveLength(0);
  });
});

describe("dual write → transactional outbox", () => {
  it("an order rejected for stock (409) never produces an OrderPlaced, not even later", async () => {
    // SKU-CAP has stock 1
    const res = await h.api().post("/orders").send({ customerId: "cust-2", items: [{ sku: "SKU-CAP", quantity: 2 }] });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("OUT_OF_STOCK");
    expect(await h.sql("SELECT * FROM orders"), "the order must be rolled back").toHaveLength(0);
    expect(h.bus.messages(ORDERS_TOPIC), "an OrderPlaced was published for an order that doesn't exist (ghost event)").toHaveLength(0);

    await h.container.relay.runOnce();
    expect(h.bus.messages(ORDERS_TOPIC), "the relay published an event for a rolled-back order").toHaveLength(0);
  });

  it("doesn't talk to Kafka during the request: the event goes to the outbox in the same transaction", async () => {
    const order = await placeOrder(h, { customerId: "cust-1", items: [{ sku: "SKU-TEE", quantity: 2 }] });
    expect(h.bus.publishCalls, "POST /orders published directly to the bus").toBe(0);

    const rows = await outboxRows(h);
    expect(rows, "expected exactly one outbox row for the new order").toHaveLength(1);
    const row = rows[0]!;
    expect(row.topic).toBe(ORDERS_TOPIC);
    expect(row.message_key, "key by orderId so all events of an order stay ordered").toBe(order.id);
    expect(row.published_at).toBeNull();
    expect(row.payload).toMatchObject({
      orderId: order.id,
      customerId: "cust-1",
      total: { amountCents: 5000, currency: "EUR" },
    });
    expect(row.payload.eventId).toEqual(expect.any(String));
    expect(row.headers).toMatchObject({ "event-type": "OrderPlaced", "event-version": "2", "event-id": row.payload.eventId });
  });

  it("checkout keeps working while the broker is down; the event is published once it's back", async () => {
    h.bus.failNext(1000); // Kafka is down
    const res = await h.api().post("/orders").send({ customerId: "cust-3", items: [{ sku: "SKU-MUG", quantity: 1 }] });
    expect(res.status, `checkout failed while Kafka was down: ${JSON.stringify(res.body)}`).toBe(201);
    expect(await outboxRows(h)).toHaveLength(1);

    h.bus.heal(); // Kafka is back
    expect(await h.container.relay.runOnce()).toBe(1);
    const published = h.bus.messages(ORDERS_TOPIC);
    expect(published).toHaveLength(1);
    expect(published[0]!.key).toBe(res.body.data.id);
  });
});
