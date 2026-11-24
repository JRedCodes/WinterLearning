import { Kafka, Partitioners, logLevel, type Admin, type Consumer, type IHeaders, type Producer } from "kafkajs";
import type { BusMessage, ConsumedEvent, EventBus, EventHandler, Headers } from "./eventBus.js";

/** kafkajs adapters. The only file (besides server.ts) that knows Kafka exists. */

export function createKafka(clientId: string, brokers: string[]): Kafka {
  return new Kafka({ clientId, brokers, logLevel: logLevel.WARN, retry: { initialRetryTime: 200, retries: 8 } });
}

export async function ensureTopics(admin: Admin, topics: string[], numPartitions = 3): Promise<void> {
  const existing = new Set(await admin.listTopics());
  const missing = topics.filter((t) => !existing.has(t));
  if (missing.length === 0) return;
  await admin.createTopics({
    waitForLeaders: true,
    topics: missing.map((topic) => ({ topic, numPartitions, replicationFactor: 1 })),
  });
}

export class KafkaEventBus implements EventBus {
  private constructor(private readonly producer: Producer) {}

  static async connect(kafka: Kafka): Promise<KafkaEventBus> {
    const producer = kafka.producer({
      idempotent: true, // broker drops duplicate batches caused by producer retries
      maxInFlightRequests: 1,
      createPartitioner: Partitioners.DefaultPartitioner,
    });
    await producer.connect();
    return new KafkaEventBus(producer);
  }

  async publish(topic: string, messages: BusMessage[]): Promise<void> {
    await this.producer.send({
      topic,
      acks: -1,
      messages: messages.map((m) => ({ key: m.key, value: m.value, headers: m.headers })),
    });
  }

  async disconnect(): Promise<void> {
    await this.producer.disconnect();
  }
}

/**
 * Runs `handler` for every record of `topic`. Offsets are auto-committed by
 * kafkajs only AFTER the handler resolves, so this is at-least-once: wrap the
 * handler with withDeadLetter() so a poison message can't block the partition.
 */
export async function startKafkaConsumer(options: {
  kafka: Kafka;
  groupId: string;
  topic: string;
  handler: EventHandler;
  fromBeginning?: boolean;
}): Promise<Consumer> {
  const consumer = options.kafka.consumer({ groupId: options.groupId, sessionTimeout: 30_000, heartbeatInterval: 3_000 });
  await consumer.connect();
  await consumer.subscribe({ topics: [options.topic], fromBeginning: options.fromBeginning ?? true });
  await consumer.run({
    eachMessage: async ({ topic, partition, message }) => {
      const event: ConsumedEvent = {
        topic,
        partition,
        offset: message.offset,
        key: message.key?.toString("utf8") ?? null,
        value: message.value?.toString("utf8") ?? null,
        headers: toHeaders(message.headers),
      };
      await options.handler(event);
    },
  });
  return consumer;
}

function toHeaders(raw: IHeaders | undefined): Headers {
  const out: Headers = {};
  for (const [name, value] of Object.entries(raw ?? {})) {
    const first = Array.isArray(value) ? value[0] : value;
    if (first !== undefined) out[name] = first.toString();
  }
  return out;
}
