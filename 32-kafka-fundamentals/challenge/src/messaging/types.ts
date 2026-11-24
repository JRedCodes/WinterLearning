/**
 * Ports: the small messaging interfaces our application code depends on.
 *
 * They deliberately mirror the shape of kafkajs (subscribe / run / eachMessage /
 * commitOffsets) so the real adapter is a thin translation layer, but they use
 * plain strings instead of Buffers and contain nothing Kafka-client-specific.
 * Two implementations exist:
 *   - kafkaAdapter.ts    → a real broker via kafkajs
 *   - inMemoryBroker.ts  → a deterministic model of Kafka used by the tests
 */

export type Headers = Record<string, string>;

/** acks: 0 = fire and forget, 1 = leader wrote it, -1 = all in-sync replicas wrote it. */
export type Acks = -1 | 0 | 1;

export interface OutgoingMessage {
  /** Decides the partition. null = no key (spread round-robin, no ordering). */
  key: string | null;
  value: string;
  headers?: Headers;
}

export interface ProduceRequest {
  topic: string;
  messages: OutgoingMessage[];
  acks?: Acks;
}

/** One entry per partition written by a send() call. */
export interface PartitionWriteResult {
  topic: string;
  partition: number;
  /** Offset of the first message of this send() that landed in this partition. */
  baseOffset: string;
}

export interface ProducerPort {
  send(request: ProduceRequest): Promise<PartitionWriteResult[]>;
}

export interface ConsumedMessage {
  key: string | null;
  /** null is a "tombstone" (used by compacted topics to delete a key). */
  value: string | null;
  headers: Headers;
  /** Offsets are strings in kafkajs because they are 64-bit integers. */
  offset: string;
  timestamp: string;
}

export interface EachMessagePayload {
  topic: string;
  partition: number;
  message: ConsumedMessage;
}

export type EachMessageHandler = (payload: EachMessagePayload) => Promise<void>;

export interface TopicPartitionOffset {
  topic: string;
  partition: number;
  /** The NEXT offset the group should read (last processed offset + 1). */
  offset: string;
}

export interface ConsumerPort {
  subscribe(options: { topics: string[]; fromBeginning?: boolean }): Promise<void>;
  /**
   * Starts consuming. With autoCommit: true (the default) offsets are committed
   * for you after eachMessage resolves; with false, YOU call commitOffsets().
   * If eachMessage throws, that message is retried and later messages of the
   * same partition wait.
   */
  run(options: { eachMessage: EachMessageHandler; autoCommit?: boolean }): Promise<void>;
  commitOffsets(offsets: TopicPartitionOffset[]): Promise<void>;
  disconnect(): Promise<void>;
}

export interface Logger {
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
}
