/**
 * The messaging port. Services depend on this, never on kafkajs.
 * Implementations: kafka.ts (real broker) and inMemoryEventBus.ts (tests).
 */

export type Headers = Record<string, string>;

export interface BusMessage {
  /** Partition key: events with the same key stay in order. */
  key: string;
  value: string;
  headers: Headers;
}

export interface EventBus {
  /** Resolves once the broker acknowledged every message (acks = all). */
  publish(topic: string, messages: BusMessage[]): Promise<void>;
}

/** A record as a consumer receives it. */
export interface ConsumedEvent {
  topic: string;
  partition: number;
  offset: string;
  key: string | null;
  value: string | null;
  headers: Headers;
}

export type EventHandler = (event: ConsumedEvent) => Promise<void>;
