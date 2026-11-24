import { randomUUID } from "node:crypto";
import type { Admin, Consumer, Kafka } from "kafkajs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildContainer } from "../../src/container.js";
import { withDeadLetter } from "../../src/consumers/deadLetter.js";
import type { ConsumedEvent } from "../../src/events/eventBus.js";
import { KafkaEventBus, createKafka, ensureTopics, startKafkaConsumer } from "../../src/events/kafka.js";
import { createPool } from "../../src/lib/db.js";
import { DATABASE_URL, resetDatabase } from "../helpers/harness.js";

/**
 * Real Postgres + real Kafka. Skipped unless KAFKA_BROKERS is set:
 *   make up && make test-integration
 * Topic and group names are unique per run; topics are deleted afterwards.
 */
const BROKERS = process.env.KAFKA_BROKERS;

async function waitFor<T>(what: string, probe: () => Promise<T>, done: (v: T) => boolean, timeoutMs = 45_000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  let last = await probe();
  while (!done(last)) {
    if (Date.now() > deadline) throw new Error(`timed out after ${timeoutMs}ms waiting for ${what}; last value: ${JSON.stringify(last)}`);
    await new Promise((r) => setTimeout(r, 250));
    last = await probe();
  }
  return last;
}

describe.skipIf(!BROKERS)("orders → outbox → Kafka → payments (integration)", () => {
  const runId = `${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`;
  const ordersTopic = `wl33.it.orders.${runId}`;
  const dlqTopic = `wl33.it.payments-dlq.${runId}`;
  const pool = createPool(DATABASE_URL, 5);
  pool.on("error", () => {});

  let kafka: Kafka;
  let admin: Admin;
  let bus: KafkaEventBus | undefined;
  const consumers: Consumer[] = [];
  const dlqMessages: ConsumedEvent[] = [];

  beforeAll(async () => {
    await resetDatabase(pool);
    kafka = createKafka(`wl-33-it-${runId}`, BROKERS!.split(","));
    admin = kafka.admin();
    await admin.connect();
    await ensureTopics(admin, [ordersTopic, dlqTopic], 3);
    bus = await KafkaEventBus.connect(kafka);
  }, 60_000);

  afterAll(async () => {
    for (const c of consumers) await c.disconnect().catch(() => {});
    await bus?.disconnect().catch(() => {});
    await admin?.deleteTopics({ topics: [ordersTopic, dlqTopic] }).catch(() => {});
    await admin?.disconnect().catch(() => {});
    await pool.end().catch(() => {});
  }, 60_000);

  it("charges each order exactly once and dead-letters a poison message without blocking", async () => {
    const container = buildContainer({ pool, bus: bus!, ordersTopic });

    // 1. Two orders through the API → outbox → relay → Kafka.
    const ids: string[] = [];
    for (const customerId of ["alice", "bob"]) {
      const order = await container.orderService.placeOrder({ customerId, items: [{ sku: "SKU-MUG", quantity: 2 }] });
      ids.push(order.id);
    }
    // 2. A poison message (a version nobody understands), published straight to the topic, keyed like the first order.
    await bus!.publish(ordersTopic, [
      { key: ids[0]!, value: JSON.stringify({ hello: "from the future" }), headers: { "event-type": "OrderPlaced", "event-version": "99", "event-id": `poison-${runId}` } },
    ]);
    expect(await container.relay.runOnce()).toBe(2);
    // 3. Republish the same outbox events (simulates a relay that crashed after publishing but
    //    before marking them): consumers must not double charge.
    await pool.query("UPDATE outbox SET published_at = NULL");
    expect(await container.relay.runOnce()).toBe(2);

    consumers.push(
      await startKafkaConsumer({
        kafka,
        groupId: `wl33-it-dlq-reader-${runId}`,
        topic: dlqTopic,
        handler: async (e) => {
          dlqMessages.push(e);
        },
      }),
    );
    consumers.push(
      await startKafkaConsumer({
        kafka,
        groupId: `wl33-it-payments-${runId}`,
        topic: ordersTopic,
        handler: withDeadLetter((e) => container.payments.handle(e), { bus: bus!, dlqTopic, maxAttempts: 2, backoffMs: 50 }),
      }),
    );

    const payments = await waitFor(
      "both orders to be charged",
      async () => (await pool.query<{ order_id: string; amount_cents: number }>("SELECT order_id, amount_cents FROM payments ORDER BY id")).rows,
      (rows) => rows.length >= 2,
    );
    await waitFor("the poison message to reach the DLQ", async () => dlqMessages.length, (n) => n >= 1);

    // Give any duplicate deliveries a moment to (wrongly) show up.
    await new Promise((r) => setTimeout(r, 1500));
    const final = (await pool.query<{ order_id: string; amount_cents: number }>("SELECT order_id, amount_cents FROM payments ORDER BY id")).rows;
    expect(final, `payments: ${JSON.stringify(payments)}`).toHaveLength(2);
    expect(new Set(final.map((p) => p.order_id))).toEqual(new Set(ids));
    expect(final.every((p) => p.amount_cents === 2400)).toBe(true);

    expect(dlqMessages).toHaveLength(1);
    expect(dlqMessages[0]!.headers).toMatchObject({ "dlq-original-topic": ordersTopic, "event-version": "99" });
  }, 120_000);
});
