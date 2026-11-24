import { describe, expect, it } from "vitest";
import { OrderProjectionConsumer } from "../src/consumer/orderProjectionConsumer.js";
import { InMemoryBroker } from "../src/messaging/inMemoryBroker.js";
import { computeLag } from "../src/ops/lag.js";
import { OrderEventProducer } from "../src/producer/orderEventProducer.js";
import { InMemoryProjectionStore } from "../src/projection/projectionStore.js";
import { cancelled, placed, recordingLogger } from "./helpers/fakes.js";

/**
 * End to end through the in-memory broker: producer → topic (6 partitions) →
 * consumer groups. Passes once TODOs 1–6 are done.
 */
const TOPIC = "orders.v1";
const PARTITIONS = 6;

function lagOf(broker: InMemoryBroker, groupId: string) {
  const watermarks = Array.from({ length: PARTITIONS }, (_, p) => ({ partition: p, low: "0", high: String(broker.endOffset(TOPIC, p)) }));
  const committed = watermarks.map(({ partition }) => ({
    partition,
    offset: String(broker.committedOffset(groupId, TOPIC, partition) ?? -1),
  }));
  return computeLag(watermarks, committed);
}

async function seed(producer: OrderEventProducer) {
  const events = [];
  for (let i = 1; i <= 30; i++) events.push(placed(`order-${i}`, `cust-${i % 5}`, i * 100));
  for (const i of [3, 8, 15]) events.push(cancelled(`order-${i}`, `cust-${i % 5}`, i * 100));
  await producer.publishMany(events);
}

/** What the totals must be after processing seed() exactly once. */
function expectedTotals() {
  const t = new Map<string, { placedCount: number; cancelledCount: number; netTotalCents: number }>();
  for (let i = 1; i <= 30; i++) {
    const row = t.get(`cust-${i % 5}`) ?? { placedCount: 0, cancelledCount: 0, netTotalCents: 0 };
    row.placedCount++;
    row.netTotalCents += i * 100;
    t.set(`cust-${i % 5}`, row);
  }
  for (const i of [3, 8, 15]) {
    const row = t.get(`cust-${i % 5}`)!;
    row.cancelledCount++;
    row.netTotalCents -= i * 100;
  }
  return [...t.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([customerId, row]) => ({ customerId, ...row }));
}

describe("pipeline: producer → Kafka model → projection", () => {
  it("spreads keyed events over several partitions", async () => {
    const broker = new InMemoryBroker({ defaultPartitions: PARTITIONS });
    broker.createTopic(TOPIC, PARTITIONS);
    await seed(new OrderEventProducer({ producer: broker.producer(), topic: TOPIC }));
    const used = Array.from({ length: PARTITIONS }, (_, p) => broker.endOffset(TOPIC, p)).filter((n) => n > 0);
    expect(used.length, "all events landed on one partition: is partitionFor implemented?").toBeGreaterThanOrEqual(4);
  });

  it("two consumers in one group split the partitions and process every event once", async () => {
    const broker = new InMemoryBroker({ defaultPartitions: PARTITIONS });
    broker.createTopic(TOPIC, PARTITIONS);
    const store = new InMemoryProjectionStore();
    const a = broker.consumer({ groupId: "customer-totals" });
    const b = broker.consumer({ groupId: "customer-totals" });
    await new OrderProjectionConsumer({ consumer: a, store, topic: TOPIC, logger: recordingLogger() }).start();
    await new OrderProjectionConsumer({ consumer: b, store, topic: TOPIC, logger: recordingLogger() }).start();
    expect(a.assignment().length + b.assignment().length).toBe(PARTITIONS);
    expect(a.assignment().length).toBe(3);

    await seed(new OrderEventProducer({ producer: broker.producer(), topic: TOPIC }));
    await broker.drain();

    expect(await store.all()).toMatchObject(expectedTotals());
    expect(store.processedCount()).toBe(33);
    expect(lagOf(broker, "customer-totals").total).toBe(0);
  });

  it("a second consumer group gets its own full copy of the stream", async () => {
    const broker = new InMemoryBroker({ defaultPartitions: PARTITIONS });
    broker.createTopic(TOPIC, PARTITIONS);
    const totals = new InMemoryProjectionStore();
    const audit = new InMemoryProjectionStore();
    await new OrderProjectionConsumer({ consumer: broker.consumer({ groupId: "customer-totals" }), store: totals, topic: TOPIC, logger: recordingLogger() }).start();
    await seed(new OrderEventProducer({ producer: broker.producer(), topic: TOPIC }));
    await broker.drain();

    // A new group created later still sees the whole history (fromBeginning).
    await new OrderProjectionConsumer({ consumer: broker.consumer({ groupId: "audit" }), store: audit, topic: TOPIC, logger: recordingLogger() }).start();
    await broker.drain();

    expect(await audit.all()).toEqual(await totals.all());
    expect(lagOf(broker, "audit").total).toBe(0);
  });

  it("survives a consumer crash: the survivor takes over without double counting", async () => {
    const broker = new InMemoryBroker({ defaultPartitions: PARTITIONS });
    broker.createTopic(TOPIC, PARTITIONS);
    const store = new InMemoryProjectionStore();
    const a = broker.consumer({ groupId: "customer-totals" });
    const b = broker.consumer({ groupId: "customer-totals" });
    await new OrderProjectionConsumer({ consumer: a, store, topic: TOPIC, logger: recordingLogger() }).start();
    await new OrderProjectionConsumer({ consumer: b, store, topic: TOPIC, logger: recordingLogger() }).start();

    await seed(new OrderEventProducer({ producer: broker.producer(), topic: TOPIC }));
    // Consumer A saves its first event but "crashes" before the commit lands.
    broker.failNextCommits(1);
    await broker.drain({ maxRounds: 1 });
    await a.disconnect(); // rebalance: B now owns all 6 partitions
    expect(b.assignment()).toHaveLength(PARTITIONS);
    await broker.drain();

    expect(await store.all()).toMatchObject(expectedTotals());
    expect(lagOf(broker, "customer-totals").total).toBe(0);
  });
});
