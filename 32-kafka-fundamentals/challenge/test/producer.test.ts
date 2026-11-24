import { describe, expect, it } from "vitest";
import { orderEventSchema } from "../src/domain/orderEvents.js";
import { InMemoryBroker } from "../src/messaging/inMemoryBroker.js";
import { partitionFor } from "../src/messaging/partitioner.js";
import type { OrderEventInput } from "../src/domain/orderEvents.js";
import { InvalidOrderEventError, OrderEventProducer, toMessage } from "../src/producer/orderEventProducer.js";
import { FIXED_NOW, cancelled, placed, sequentialIds } from "./helpers/fakes.js";

const TOPIC = "orders.v1";

function setup() {
  const broker = new InMemoryBroker({ defaultPartitions: 3 });
  broker.createTopic(TOPIC, 3);
  const producer = new OrderEventProducer({
    producer: broker.producer(),
    topic: TOPIC,
    newId: sequentialIds(),
    now: () => FIXED_NOW,
  });
  return { broker, producer };
}

describe("toMessage (TODO 2c)", () => {
  const event = {
    type: "OrderPlaced" as const,
    eventId: "evt-42",
    occurredAt: "2026-01-15T09:30:00.000Z",
    orderId: "order-7",
    customerId: "cust-1",
    totalCents: 4200,
  };

  it("keys the record by orderId", () => {
    expect(toMessage(event).key).toBe("order-7");
  });

  it("serializes the whole event as JSON", () => {
    expect(JSON.parse(toMessage(event).value)).toEqual(event);
  });

  it("sets event-type, event-version, event-id and content-type headers", () => {
    expect(toMessage(event).headers).toEqual({
      "event-type": "OrderPlaced",
      "event-version": "1",
      "event-id": "evt-42",
      "content-type": "application/json",
    });
  });
});

describe("OrderEventProducer.publish (TODO 2a)", () => {
  it("writes one valid, complete event to the topic", async () => {
    const { broker, producer } = setup();
    const result = await producer.publish(placed("order-1", "cust-1", 1999));

    const records = broker.records(TOPIC);
    expect(records).toHaveLength(1);
    const value = JSON.parse(records[0]!.value!);
    expect(orderEventSchema.safeParse(value).success, `record value is not a valid OrderEvent: ${records[0]!.value}`).toBe(true);
    expect(value).toMatchObject({
      type: "OrderPlaced",
      orderId: "order-1",
      customerId: "cust-1",
      totalCents: 1999,
      eventId: "evt-1",
      occurredAt: FIXED_NOW.toISOString(),
    });
    expect(result).toEqual({ eventId: "evt-1", partition: partitionFor("order-1", 3), offset: "0" });
  });

  it("keeps a caller-supplied eventId and occurredAt (so retries are recognisable)", async () => {
    const { broker, producer } = setup();
    await producer.publish(placed("order-1", "cust-1", 100, { eventId: "my-id", occurredAt: "2025-12-24T18:00:00.000Z" }));
    const value = JSON.parse(broker.records(TOPIC)[0]!.value!);
    expect(value.eventId).toBe("my-id");
    expect(value.occurredAt).toBe("2025-12-24T18:00:00.000Z");
    expect(broker.records(TOPIC)[0]!.headers["event-id"]).toBe("my-id");
  });

  it("waits for all in-sync replicas (acks = -1)", async () => {
    const { broker, producer } = setup();
    await producer.publish(placed("order-1", "cust-1", 100));
    expect(broker.sendLog[0]?.acks).toBe(-1);
  });

  it("puts every event of one order on the same partition, in publish order", async () => {
    const { broker, producer } = setup();
    await producer.publish(placed("order-9", "cust-2", 500));
    await producer.publish(placed("order-3", "cust-1", 300));
    await producer.publish(cancelled("order-9", "cust-2", 500));
    const p = partitionFor("order-9", 3);
    const types = broker
      .records(TOPIC, p)
      .filter((r) => r.key === "order-9")
      .map((r) => r.headers["event-type"]);
    expect(types).toEqual(["OrderPlaced", "OrderCancelled"]);
  });

  it("rejects an invalid event with InvalidOrderEventError and sends nothing", async () => {
    const { broker, producer } = setup();
    const bad = { type: "OrderPlaced", orderId: "", customerId: "cust-1", totalCents: -5 } as OrderEventInput;
    await expect(producer.publish(bad)).rejects.toBeInstanceOf(InvalidOrderEventError);
    await expect(producer.publish(bad)).rejects.toThrow(/orderId|totalCents/);
    expect(broker.sendLog, "nothing should reach the broker").toHaveLength(0);
  });

  it("rejects unknown event types", async () => {
    const { broker, producer } = setup();
    const bad = { type: "OrderShipped", orderId: "o", customerId: "c" } as unknown as OrderEventInput;
    await expect(producer.publish(bad)).rejects.toBeInstanceOf(InvalidOrderEventError);
    expect(broker.sendLog).toHaveLength(0);
  });

  it("lets broker errors propagate to the caller", async () => {
    const { broker, producer } = setup();
    broker.failNextSends(1);
    await expect(producer.publish(placed("order-1", "cust-1", 100))).rejects.toThrow(/unavailable/);
  });
});

describe("OrderEventProducer.publishMany (TODO 2b)", () => {
  it("sends the whole batch in a single request", async () => {
    const { broker, producer } = setup();
    const result = await producer.publishMany([
      placed("order-1", "cust-1", 100),
      placed("order-2", "cust-2", 200),
      placed("order-3", "cust-1", 300),
      cancelled("order-1", "cust-1", 100),
    ]);
    expect(broker.sendLog, "expected exactly one send() call").toHaveLength(1);
    expect(broker.sendLog[0]!.messages).toHaveLength(4);
    expect(broker.sendLog[0]!.acks).toBe(-1);
    expect(result.eventIds).toEqual(["evt-1", "evt-2", "evt-3", "evt-4"]);
    expect(broker.records(TOPIC)).toHaveLength(4);
    expect(result.partitions.length).toBeGreaterThan(0);
  });

  it("routes each message of the batch by its own key", async () => {
    const { broker, producer } = setup();
    const orders = ["order-1", "order-2", "order-3", "order-4", "order-5", "order-6"];
    await producer.publishMany(orders.map((o) => placed(o, "cust-1", 100)));
    for (const o of orders) {
      const p = partitionFor(o, 3);
      expect(broker.records(TOPIC, p).some((r) => r.key === o), `${o} should be on partition ${p}`).toBe(true);
    }
  });

  it("validates every event before sending any (all or nothing)", async () => {
    const { broker, producer } = setup();
    const bad = { type: "OrderCancelled", orderId: "order-2", customerId: "cust-1", totalCents: 5 } as OrderEventInput; // no reason
    await expect(producer.publishMany([placed("order-1", "cust-1", 100), bad])).rejects.toBeInstanceOf(InvalidOrderEventError);
    expect(broker.sendLog).toHaveLength(0);
  });

  it("sends nothing for an empty batch", async () => {
    const { broker, producer } = setup();
    await expect(producer.publishMany([])).resolves.toEqual({ eventIds: [], partitions: [] });
    expect(broker.sendLog).toHaveLength(0);
  });
});
