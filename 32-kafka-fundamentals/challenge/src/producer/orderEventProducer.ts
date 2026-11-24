import { randomUUID } from "node:crypto";
import {
  HEADERS,
  ORDER_EVENT_VERSION,
  orderEventInputSchema,
  type OrderEvent,
  type OrderEventInput,
} from "../domain/orderEvents.js";
import type { OutgoingMessage, PartitionWriteResult, ProducerPort } from "../messaging/types.js";

export class InvalidOrderEventError extends Error {
  constructor(readonly issues: string[]) {
    super(`invalid order event: ${issues.join("; ")}`);
    this.name = "InvalidOrderEventError";
  }
}

export interface OrderEventProducerDeps {
  producer: ProducerPort;
  topic: string;
  /** Injected so tests are deterministic. */
  newId?: () => string;
  now?: () => Date;
}

export interface PublishedEvent {
  eventId: string;
  partition: number;
  offset: string;
}

export interface PublishedBatch {
  eventIds: string[];
  partitions: PartitionWriteResult[];
}

export class OrderEventProducer {
  private readonly producer: ProducerPort;
  private readonly topic: string;
  private readonly newId: () => string;
  private readonly now: () => Date;

  constructor(deps: OrderEventProducerDeps) {
    this.producer = deps.producer;
    this.topic = deps.topic;
    this.newId = deps.newId ?? randomUUID;
    this.now = deps.now ?? (() => new Date());
  }

  /**
   * TODO(2a): publish one event.
   *  1. Validate `input` with orderEventInputSchema. If invalid, throw an
   *     InvalidOrderEventError listing the issues, and send NOTHING.
   *  2. Fill in eventId (this.newId()) and occurredAt (this.now().toISOString())
   *     when the caller didn't provide them.
   *  3. Send ONE request to this.topic with acks: -1 (wait for all in-sync replicas)
   *     containing toMessage(event).
   *  4. Return { eventId, partition, offset } from the first write result
   *     (offset = its baseOffset).
   */
  async publish(input: OrderEventInput): Promise<PublishedEvent> {
    throw new Error("Not implemented: TODO(2a)");
  }

  /**
   * TODO(2b): publish many events in ONE send() call (batching).
   *  - Validate ALL inputs before sending anything: one invalid input means an
   *    InvalidOrderEventError and nothing is sent.
   *  - Same eventId/occurredAt defaults and acks as publish().
   *  - An empty array sends nothing and returns { eventIds: [], partitions: [] }.
   *  - Return the event ids (in input order) and the write results.
   */
  async publishMany(inputs: OrderEventInput[]): Promise<PublishedBatch> {
    throw new Error("Not implemented: TODO(2b)");
  }
}

/**
 * TODO(2c): domain event → Kafka record.
 *  - key: the orderId (all events of one order go to one partition, so they stay ordered)
 *  - value: the event as JSON
 *  - headers: event-type, event-version (ORDER_EVENT_VERSION), event-id and
 *    content-type "application/json". Use the HEADERS constants for the names.
 */
export function toMessage(event: OrderEvent): OutgoingMessage {
  void ORDER_EVENT_VERSION;
  throw new Error("Not implemented: TODO(2c)");
}
