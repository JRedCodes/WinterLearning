/**
 * Composition root: config, Postgres, Kafka, HTTP server, outbox relay,
 * payments consumer, graceful shutdown.
 *
 *   make up && make dev
 */
import { loadConfig } from "./config.js";
import { buildContainer } from "./container.js";
import { withDeadLetter } from "./consumers/deadLetter.js";
import { migrate } from "./db/migrate.js";
import { KafkaEventBus, createKafka, ensureTopics, startKafkaConsumer } from "./events/kafka.js";
import { createPool } from "./lib/db.js";
import { createConsoleLogger } from "./lib/logger.js";

const config = loadConfig();
const logger = createConsoleLogger("shop");

const pool = createPool(config.DATABASE_URL);
await migrate(pool);

const kafka = createKafka(config.KAFKA_CLIENT_ID, config.kafkaBrokers);
const admin = kafka.admin();
await admin.connect();
await ensureTopics(admin, [config.ORDERS_TOPIC, config.PAYMENTS_DLQ_TOPIC]);
await admin.disconnect();

const bus = await KafkaEventBus.connect(kafka);
const { app, relay, payments } = buildContainer({
  pool,
  bus,
  ordersTopic: config.ORDERS_TOPIC,
  relayBatchSize: config.RELAY_BATCH_SIZE,
  logger,
});

relay.start(config.RELAY_INTERVAL_MS);

const consumer = await startKafkaConsumer({
  kafka,
  groupId: config.PAYMENTS_GROUP_ID,
  topic: config.ORDERS_TOPIC,
  handler: withDeadLetter((event) => payments.handle(event), {
    bus,
    dlqTopic: config.PAYMENTS_DLQ_TOPIC,
    maxAttempts: config.MAX_ATTEMPTS,
    logger,
  }),
});

const server = app.listen(config.PORT, () => logger.info(`orders API on http://localhost:${config.PORT}`));

let stopping = false;
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, async () => {
    if (stopping) return;
    stopping = true;
    logger.info(`${signal} received, shutting down`);
    server.close();
    await relay.stop();
    await consumer.disconnect().catch(() => {});
    await bus.disconnect().catch(() => {});
    await pool.end().catch(() => {});
    process.exit(0);
  });
}
