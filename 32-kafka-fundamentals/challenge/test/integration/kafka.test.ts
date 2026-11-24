import { randomUUID } from "node:crypto";
import type { Admin, Kafka } from "kafkajs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { OrderProjectionConsumer } from "../../src/consumer/orderProjectionConsumer.js";
import {
  KafkaConsumerAdapter,
  KafkaProducerAdapter,
  createKafka,
  ensureTopic,
} from "../../src/messaging/kafkaAdapter.js";
import { partitionFor } from "../../src/messaging/partitioner.js";
import { fetchConsumerLag } from "../../src/ops/lag.js";
import { OrderEventProducer } from "../../src/producer/orderEventProducer.js";
import { InMemoryProjectionStore } from "../../src/projection/projectionStore.js";
import { cancelled, placed, recordingLogger } from "../helpers/fakes.js";

/**
 * Real-broker tests. Skipped unless KAFKA_BROKERS is set:
 *   make up && make test-integration
 * Every run uses fresh topic and group names, so runs never see each other's data.
 */
const BROKERS = process.env.KAFKA_BROKERS;
const PARTITIONS = 3;

async function waitFor<T>(what: string, probe: () => Promise<T>, done: (value: T) => boolean, timeoutMs = 45_000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  let last: T = await probe();
  while (!done(last)) {
    if (Date.now() > deadline) throw new Error(`timed out after ${timeoutMs}ms waiting for ${what}; last value: ${JSON.stringify(last)}`);
    await new Promise((r) => setTimeout(r, 250));
    last = await probe();
  }
  return last;
}

describe.skipIf(!BROKERS)("real Kafka broker (integration)", () => {
  const runId = `${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`;
  const topic = `wl32.it.orders.${runId}`;
  const partitionsTopic = `wl32.it.partitions.${runId}`;
  const groupId = `wl32-it-totals-${runId}`;

  let kafka: Kafka;
  let admin: Admin;
  let producerAdapter: KafkaProducerAdapter | undefined;
  const consumers: KafkaConsumerAdapter[] = [];

  beforeAll(async () => {
    kafka = createKafka({ clientId: `wl-32-it-${runId}`, brokers: BROKERS!.split(",") });
    admin = kafka.admin();
    await admin.connect();
    await ensureTopic(admin, topic, PARTITIONS);
    await ensureTopic(admin, partitionsTopic, PARTITIONS);
    producerAdapter = await KafkaProducerAdapter.connect(kafka);
  }, 60_000);

  afterAll(async () => {
    for (const c of consumers) await c.disconnect().catch(() => {});
    await producerAdapter?.disconnect().catch(() => {});
    await admin?.deleteTopics({ topics: [topic, partitionsTopic] }).catch(() => {});
    await admin?.disconnect().catch(() => {});
  }, 60_000);

  it("partitionFor() agrees with the partition the real broker client chose", async () => {
    const producer = new OrderEventProducer({ producer: producerAdapter!, topic: partitionsTopic });
    for (const orderId of ["order-1", "order-2", "order-42", "a-little-bit-longer-string", "ünïcödé-🚀"]) {
      const result = await producer.publish(placed(orderId, "cust-1", 100));
      expect(result.partition, `partition for key ${orderId}`).toBe(partitionFor(orderId, PARTITIONS));
    }
  }, 60_000);

  it("projects totals exactly once and catches up to zero lag", async () => {
    const producer = new OrderEventProducer({ producer: producerAdapter!, topic });
    const events = [
      placed("order-1", "alice", 1000),
      placed("order-2", "alice", 2500),
      placed("order-3", "bob", 700),
      placed("order-4", "carol", 300),
      cancelled("order-1", "alice", 1000),
      placed("order-5", "bob", 50),
    ];
    const batch = await producer.publishMany(events);
    // Publish one event twice with the same eventId: the projection must count it once.
    await producer.publish(placed("order-6", "carol", 400, { eventId: "dup-1" }));
    await producer.publish(placed("order-6", "carol", 400, { eventId: "dup-1" }));
    expect(batch.eventIds).toHaveLength(events.length);

    const store = new InMemoryProjectionStore();
    const consumer = await KafkaConsumerAdapter.connect(kafka, groupId);
    consumers.push(consumer);
    await new OrderProjectionConsumer({ consumer, store, topic, logger: recordingLogger() }).start();

    await waitFor("all 7 distinct events to be applied", async () => store.processedCount(), (n) => n >= 7);
    expect(await store.all()).toMatchObject([
      { customerId: "alice", placedCount: 2, cancelledCount: 1, netTotalCents: 2500 },
      { customerId: "bob", placedCount: 2, cancelledCount: 0, netTotalCents: 750 },
      { customerId: "carol", placedCount: 2, cancelledCount: 0, netTotalCents: 700 },
    ]);

    const lag = await waitFor("the committed offsets to reach the end of every partition", () => fetchConsumerLag(admin, groupId, topic), (r) => r.total === 0);
    expect(lag.partitions).toHaveLength(PARTITIONS);
  }, 90_000);
});
