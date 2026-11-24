import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { ORDERS_TOPIC, createHarness, freshState, outboxRows, placeOrder, type Harness, type PlacedOrder } from "./helpers/harness.js";

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

async function placeMany(n: number): Promise<PlacedOrder[]> {
  const orders: PlacedOrder[] = [];
  for (let i = 0; i < n; i++) orders.push(await placeOrder(h, { customerId: `cust-${i}`, items: [{ sku: "SKU-MUG", quantity: 1 }] }));
  return orders;
}

describe("OutboxRelay.runOnce", () => {
  it("publishes pending events in order with key, value and headers, then marks them published", async () => {
    const orders = await placeMany(3);
    const published = await h.container.relay.runOnce();
    expect(published).toBe(3);

    const messages = h.bus.messages(ORDERS_TOPIC);
    expect(messages.map((m) => m.key)).toEqual(orders.map((o) => o.id));
    const first = JSON.parse(messages[0]!.value);
    expect(first).toMatchObject({ orderId: orders[0]!.id, total: { amountCents: 1200, currency: "EUR" } });
    expect(messages[0]!.headers).toMatchObject({ "event-type": "OrderPlaced", "event-version": "2", "event-id": first.eventId });

    const rows = await outboxRows(h);
    expect(rows.every((r) => r.published_at !== null), "every published row needs published_at").toBe(true);
  });

  it("publishes nothing the second time", async () => {
    await placeMany(2);
    await h.container.relay.runOnce();
    expect(await h.container.relay.runOnce()).toBe(0);
    expect(h.bus.messages(ORDERS_TOPIC)).toHaveLength(2);
  });

  it("on a publish failure, keeps the failed row (and everything after it) pending and preserves order on retry", async () => {
    const [a, b, c] = await placeMany(3);
    h.bus.failOn((_topic, m) => m.key === b!.id); // broker hiccup on the 2nd event
    expect(await h.container.relay.runOnce()).toBe(1);
    expect(h.bus.messages(ORDERS_TOPIC).map((m) => m.key)).toEqual([a!.id]);

    const pending = (await outboxRows(h)).filter((r) => r.published_at === null).map((r) => r.message_key);
    expect(pending, "the failed row and the rows after it must stay pending").toEqual([b!.id, c!.id]);

    expect(await h.container.relay.runOnce()).toBe(2);
    expect(h.bus.messages(ORDERS_TOPIC).map((m) => m.key), "events must never overtake each other").toEqual([a!.id, b!.id, c!.id]);
  });

  it("respects the batch size", async () => {
    await placeMany(5);
    const relay = h.rebuild({ relayBatchSize: 2 }).relay;
    expect(await relay.runOnce()).toBe(2);
    expect(await relay.runOnce()).toBe(2);
    expect(await relay.runOnce()).toBe(1);
    expect(await relay.runOnce()).toBe(0);
  });

  it("two relays running at the same time split the work and never publish a row twice", async () => {
    await placeMany(10);
    h.bus.delayMs = 150; // publishing is slow, so the two runs overlap
    const r1 = h.rebuild({ relayBatchSize: 5 }).relay;
    const r2 = h.rebuild({ relayBatchSize: 5 }).relay;
    const [n1, n2] = await Promise.all([r1.runOnce(), r2.runOnce()]);

    const ids = h.bus.messages(ORDERS_TOPIC).map((m) => m.headers["event-id"]);
    expect(new Set(ids).size, "an event was published twice").toBe(ids.length);
    expect([n1, n2], "each relay should claim different rows instead of duplicating the other's").toEqual([5, 5]);
    expect(h.bus.maxInFlight, "the second relay sat waiting for the first one's row locks instead of taking other rows").toBe(2);
    expect((await outboxRows(h)).filter((r) => r.published_at === null)).toHaveLength(0);
  });
});
