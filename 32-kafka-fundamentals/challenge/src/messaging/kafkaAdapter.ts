import {
  Kafka,
  Partitioners,
  logLevel,
  type Admin,
  type Consumer,
  type IHeaders,
  type KafkaMessage,
  type Producer,
} from "kafkajs";
import type {
  ConsumedMessage,
  ConsumerPort,
  EachMessageHandler,
  Headers,
  PartitionWriteResult,
  ProduceRequest,
  ProducerPort,
  TopicPartitionOffset,
} from "./types.js";

/**
 * The real-broker adapter: translates our ports to kafkajs and back
 * (Buffers ↔ strings, kafkajs metadata ↔ our result types).
 * Nothing in here knows about orders. That's the point.
 */

export function createKafka(options: { clientId: string; brokers: string[] }): Kafka {
  return new Kafka({
    clientId: options.clientId,
    brokers: options.brokers,
    logLevel: logLevel.WARN,
    retry: { initialRetryTime: 200, retries: 8 },
  });
}

/** Creates the topic if it doesn't exist yet and waits until every partition has a leader. */
export async function ensureTopic(admin: Admin, topic: string, numPartitions: number): Promise<void> {
  const existing = await admin.listTopics();
  if (existing.includes(topic)) return;
  await admin.createTopics({
    waitForLeaders: true,
    topics: [{ topic, numPartitions, replicationFactor: 1 }],
  });
}

export class KafkaProducerAdapter implements ProducerPort {
  private constructor(private readonly producer: Producer) {}

  static async connect(kafka: Kafka): Promise<KafkaProducerAdapter> {
    const producer = kafka.producer({
      // Idempotent producer: the broker de-duplicates retried batches, so a
      // network blip can't write the same record twice. Requires acks = -1.
      idempotent: true,
      // The Java client allows up to 5 in-flight requests with idempotence; kafkajs is
      // safest with 1 (strict ordering of retried batches).
      maxInFlightRequests: 1,
      // The Java-compatible murmur2 partitioner (same algorithm as partitionFor()).
      createPartitioner: Partitioners.DefaultPartitioner,
    });
    await producer.connect();
    return new KafkaProducerAdapter(producer);
  }

  async send(request: ProduceRequest): Promise<PartitionWriteResult[]> {
    const metadata = await this.producer.send({
      topic: request.topic,
      acks: request.acks ?? -1,
      messages: request.messages.map((m) => ({ key: m.key, value: m.value, headers: m.headers })),
    });
    return metadata.map((m) => ({
      topic: m.topicName,
      partition: m.partition,
      baseOffset: m.baseOffset ?? m.offset ?? "-1",
    }));
  }

  async disconnect(): Promise<void> {
    await this.producer.disconnect();
  }
}

export class KafkaConsumerAdapter implements ConsumerPort {
  private constructor(readonly raw: Consumer) {}

  static async connect(kafka: Kafka, groupId: string): Promise<KafkaConsumerAdapter> {
    const consumer = kafka.consumer({ groupId, sessionTimeout: 30_000, heartbeatInterval: 3_000 });
    await consumer.connect();
    return new KafkaConsumerAdapter(consumer);
  }

  async subscribe(options: { topics: string[]; fromBeginning?: boolean }): Promise<void> {
    await this.raw.subscribe({ topics: options.topics, fromBeginning: options.fromBeginning ?? false });
  }

  async run(options: { eachMessage: EachMessageHandler; autoCommit?: boolean }): Promise<void> {
    await this.raw.run({
      autoCommit: options.autoCommit ?? true,
      eachMessage: async ({ topic, partition, message }) => {
        await options.eachMessage({ topic, partition, message: toConsumedMessage(message) });
      },
    });
  }

  async commitOffsets(offsets: TopicPartitionOffset[]): Promise<void> {
    await this.raw.commitOffsets(offsets);
  }

  async disconnect(): Promise<void> {
    await this.raw.disconnect();
  }
}

function toConsumedMessage(message: KafkaMessage): ConsumedMessage {
  return {
    key: message.key?.toString("utf8") ?? null,
    value: message.value?.toString("utf8") ?? null,
    headers: toHeaders(message.headers),
    offset: message.offset,
    timestamp: message.timestamp,
  };
}

function toHeaders(raw: IHeaders | undefined): Headers {
  const out: Headers = {};
  for (const [name, value] of Object.entries(raw ?? {})) {
    const first = Array.isArray(value) ? value[0] : value;
    if (first !== undefined) out[name] = first.toString();
  }
  return out;
}
