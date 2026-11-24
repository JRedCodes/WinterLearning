import { describe, expect, it, vi } from "vitest";
import { OrderProjectionConsumer } from "../src/consumer/orderProjectionConsumer.js";
import { InMemoryBroker } from "../src/messaging/inMemoryBroker.js";
import { toMessage } from "../src/producer/orderEventProducer.js";
import type { OrderEvent } from "../src/domain/orderEvents.js";
import { FlakyProjectionStore, recordingLogger } from "./helpers/fakes.js";

const TOPIC = "orders.v1";
const GROUP = "customer-totals";

/** One partition keeps offsets easy to reason about in these tests. */
function setup(partitions = 1) {
  const broker = new InMemoryBroker({ defaultPartitions: partitions });
  broker.createTopic(TOPIC, partitions);
  const store = new FlakyProjectionStore();
  const logger = recordingLogger();
  const consumer = broker.consumer({ groupId: GROUP });
  const projection = new OrderProjectionConsumer({ consumer, store, topic: TOPIC, logger });
  const producer = broker.producer();
  const publish = (...events: OrderEvent[]) => producer.send({ topic: TOPIC, messages: events.map(toMessage) });
  const publishRaw = (value: string | null, headers: Record<string, string>) =>
    producer.send({ topic: TOPIC, messages: [{ key: "raw", value: value as string, headers }] });
  return { broker, store, logger, consumer, projection, publish, publishRaw };
}

let seq = 0;
const placed = (orderId: string, customerId: string, totalCents: number, eventId = `e-${++seq}`): OrderEvent => ({
  type: "OrderPlaced",
  eventId,
  occurredAt: "2026-01-15T10:00:00.000Z",
  orderId,
  customerId,
  totalCents,
});
const cancelled = (orderId: string, customerId: string, totalCents: number): OrderEvent => ({
  type: "OrderCancelled",
  eventId: `e-${++seq}`,
  occurredAt: "2026-01-15T11:00:00.000Z",
  orderId,
  customerId,
  totalCents,
  reason: "changed mind",
});

describe("OrderProjectionConsumer.start (TODO 5a)", () => {
  it("subscribes from the beginning with auto-commit turned off", async () => {
    const { consumer, projection } = setup();
    const subscribe = vi.spyOn(consumer, "subscribe");
    const run = vi.spyOn(consumer, "run");
    await projection.start();
    expect(subscribe).toHaveBeenCalledWith(expect.objectContaining({ topics: [TOPIC], fromBeginning: true }));
    expect(run).toHaveBeenCalledWith(expect.objectContaining({ autoCommit: false }));
  });

  it("processes events that were published before the projection started", async () => {
    const { broker, store, projection, publish } = setup();
    await publish(placed("o1", "alice", 1000), placed("o2", "bob", 500));
    await projection.start();
    await broker.drain();
    expect(await store.all()).toMatchObject([
      { customerId: "alice", placedCount: 1, netTotalCents: 1000 },
      { customerId: "bob", placedCount: 1, netTotalCents: 500 },
    ]);
  });
});

describe("OrderProjectionConsumer.handle (TODO 5b)", () => {
  it("builds per-customer totals", async () => {
    const { broker, store, projection, publish } = setup();
    await projection.start();
    await publish(placed("o1", "alice", 1000), placed("o2", "alice", 2500), cancelled("o1", "alice", 1000), placed("o3", "bob", 99));
    await broker.drain();
    expect(await store.get("alice")).toMatchObject({ placedCount: 2, cancelledCount: 1, netTotalCents: 2500 });
    expect(await store.get("bob")).toMatchObject({ placedCount: 1, netTotalCents: 99 });
  });

  it("commits offset + 1 (the NEXT offset to read) after each message", async () => {
    const { broker, consumer, projection, publish } = setup();
    const commit = vi.spyOn(consumer, "commitOffsets");
    await projection.start();
    await publish(placed("o1", "alice", 1), placed("o2", "alice", 2), placed("o3", "alice", 3));
    await broker.drain();
    expect(commit).toHaveBeenCalledWith([{ topic: TOPIC, partition: 0, offset: "1" }]);
    expect(commit).toHaveBeenLastCalledWith([{ topic: TOPIC, partition: 0, offset: "3" }]);
    expect(broker.committedOffset(GROUP, TOPIC, 0)).toBe(3);
  });

  it("does NOT commit when processing fails (no message lost)", async () => {
    const { broker, store, projection, publish } = setup();
    store.failSaves = Number.POSITIVE_INFINITY; // the database is down
    await projection.start();
    await publish(placed("o1", "alice", 1000));
    await broker.drain({ maxRounds: 3 });
    expect(broker.committedOffset(GROUP, TOPIC, 0), "committed an offset for a message that was never saved").toBeUndefined();
    expect(broker.handlerErrors.length, "the save error should propagate out of handle()").toBeGreaterThan(0);
  });

  it("retries after a transient failure and applies the event exactly once", async () => {
    const { broker, store, projection, publish } = setup();
    store.failSaves = 2;
    await projection.start();
    await publish(placed("o1", "alice", 1000));
    await broker.drain();
    expect(await store.get("alice")).toMatchObject({ placedCount: 1, netTotalCents: 1000 });
    expect(broker.committedOffset(GROUP, TOPIC, 0)).toBe(1);
  });

  it("is idempotent when the commit fails after the save (redelivery)", async () => {
    const { broker, store, projection, publish } = setup();
    await projection.start();
    await publish(placed("o1", "alice", 1000));
    broker.failNextCommits(1); // saved, but the commit is lost → Kafka redelivers
    await broker.drain();
    expect(await store.get("alice"), "redelivered event was applied twice").toMatchObject({ placedCount: 1, netTotalCents: 1000 });
    expect(broker.committedOffset(GROUP, TOPIC, 0)).toBe(1);
  });

  it("ignores a duplicate publish of the same eventId (and still commits it)", async () => {
    const { broker, store, logger, projection, publish } = setup();
    await projection.start();
    const event = placed("o1", "alice", 1000, "same-id");
    await publish(event, event); // e.g. a producer retry without the idempotent producer
    await broker.drain();
    expect(await store.get("alice")).toMatchObject({ placedCount: 1, netTotalCents: 1000 });
    expect(store.processedCount()).toBe(1);
    expect(broker.committedOffset(GROUP, TOPIC, 0)).toBe(2);
    expect(logger.entries.some((e) => e.level === "info" && /duplicate/i.test(e.message))).toBe(true);
  });

  it("skips (and commits) records it can't decode, so the partition isn't blocked", async () => {
    const { broker, store, logger, projection, publish, publishRaw } = setup();
    await projection.start();
    await publishRaw("{definitely not json", { "event-type": "OrderPlaced", "event-version": "1" });
    await publish(placed("o1", "alice", 1000));
    await broker.drain();
    expect(await store.get("alice"), "the valid event behind the bad one was never processed").toMatchObject({ netTotalCents: 1000 });
    expect(broker.committedOffset(GROUP, TOPIC, 0)).toBe(2);
    const warning = logger.entries.find((e) => e.level === "warn");
    expect(warning, "expected a warning for the skipped record").toBeDefined();
    expect(warning!.context).toMatchObject({ topic: TOPIC, partition: 0, offset: "0" });
    expect(warning!.context.reason).toEqual(expect.any(String));
  });

  it("skips events with a newer schema version instead of misreading them", async () => {
    const { broker, store, projection, publishRaw } = setup();
    await projection.start();
    await publishRaw(JSON.stringify({ ...placed("o1", "alice", 1000), totalCents: { amount: 1000, currency: "EUR" } }), {
      "event-type": "OrderPlaced",
      "event-version": "2",
    });
    await broker.drain();
    expect(await store.all()).toEqual([]);
    expect(broker.committedOffset(GROUP, TOPIC, 0)).toBe(1);
  });

  it("commits large offsets correctly (offsets are 64-bit strings)", async () => {
    const { consumer, store, projection } = setup();
    const commit = vi.spyOn(consumer, "commitOffsets").mockResolvedValue();
    const event = placed("o1", "alice", 1);
    const message = toMessage(event);
    await projection.handle({
      topic: TOPIC,
      partition: 2,
      message: { key: message.key, value: message.value, headers: message.headers ?? {}, offset: "9007199254740993", timestamp: "0" },
    });
    expect(commit).toHaveBeenCalledWith([{ topic: TOPIC, partition: 2, offset: "9007199254740994" }]);
    expect(await store.get("alice")).toBeDefined();
  });
});
