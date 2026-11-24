/**
 * Publishes a few sample order events to the local broker.
 *   make up && npm run produce
 */
import { loadConfig } from "./config.js";
import type { OrderEventInput } from "./domain/orderEvents.js";
import { KafkaProducerAdapter, createKafka, ensureTopic } from "./messaging/kafkaAdapter.js";
import { OrderEventProducer } from "./producer/orderEventProducer.js";

const config = loadConfig();
const kafka = createKafka({ clientId: `${config.clientId}-cli`, brokers: config.brokers });
const admin = kafka.admin();
await admin.connect();
await ensureTopic(admin, config.ordersTopic, config.ordersPartitions);
await admin.disconnect();

const adapter = await KafkaProducerAdapter.connect(kafka);
const producer = new OrderEventProducer({ producer: adapter, topic: config.ordersTopic });

const run = Date.now().toString(36);
const events: OrderEventInput[] = [];
for (let i = 1; i <= 6; i++) {
  const customerId = `cust-${(i % 3) + 1}`;
  events.push({ type: "OrderPlaced", orderId: `ord-${run}-${i}`, customerId, totalCents: 1000 * i });
}
events.push({ type: "OrderCancelled", orderId: `ord-${run}-2`, customerId: "cust-3", totalCents: 2000, reason: "changed mind" });

const result = await producer.publishMany(events);
console.log(`published ${result.eventIds.length} events`, result.partitions);
await adapter.disconnect();
