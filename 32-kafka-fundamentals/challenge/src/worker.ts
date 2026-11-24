/**
 * Composition root for the projection worker: reads config, wires the real
 * Kafka adapter into the consumer, handles graceful shutdown.
 *
 *   make up && make dev       (in another terminal: make produce)
 */
import { loadConfig } from "./config.js";
import { OrderProjectionConsumer } from "./consumer/orderProjectionConsumer.js";
import { createConsoleLogger } from "./lib/logger.js";
import { KafkaConsumerAdapter, createKafka, ensureTopic } from "./messaging/kafkaAdapter.js";
import { fetchConsumerLag } from "./ops/lag.js";
import { InMemoryProjectionStore } from "./projection/projectionStore.js";

const config = loadConfig();
const logger = createConsoleLogger("customer-totals");
const kafka = createKafka({ clientId: config.clientId, brokers: config.brokers });

const admin = kafka.admin();
await admin.connect();
await ensureTopic(admin, config.ordersTopic, config.ordersPartitions);

const store = new InMemoryProjectionStore();
const consumer = await KafkaConsumerAdapter.connect(kafka, config.projectionGroupId);
const projection = new OrderProjectionConsumer({ consumer, store, topic: config.ordersTopic, logger });
await projection.start();
logger.info("projection running", { topic: config.ordersTopic, groupId: config.projectionGroupId });

const report = setInterval(async () => {
  try {
    const lag = await fetchConsumerLag(admin, config.projectionGroupId, config.ordersTopic);
    logger.info("status", { lag: lag.total, customers: await store.all() });
  } catch (err) {
    logger.warn("could not fetch lag", { error: (err as Error).message });
  }
}, 5_000);

let stopping = false;
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, async () => {
    if (stopping) return;
    stopping = true;
    logger.info(`${signal} received, leaving the consumer group`);
    clearInterval(report);
    // Disconnecting leaves the group cleanly, so the partitions are reassigned
    // right away instead of after the session timeout.
    await projection.stop().catch(() => {});
    await admin.disconnect().catch(() => {});
    process.exit(0);
  });
}
