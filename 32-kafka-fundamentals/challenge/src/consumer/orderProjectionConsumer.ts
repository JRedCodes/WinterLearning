import type { ConsumerPort, EachMessagePayload, Logger } from "../messaging/types.js";
import { applyEvent } from "../projection/applyEvent.js";
import type { ProjectionStore } from "../projection/projectionStore.js";
import { decodeOrderEvent } from "./decode.js";

export interface OrderProjectionConsumerDeps {
  consumer: ConsumerPort;
  store: ProjectionStore;
  topic: string;
  logger: Logger;
}

/**
 * Builds per-customer order totals from the order-events topic.
 * Goal: every event affects the totals EXACTLY once, even though Kafka
 * delivers at-least-once.
 */
export class OrderProjectionConsumer {
  private readonly consumer: ConsumerPort;
  private readonly store: ProjectionStore;
  private readonly topic: string;
  private readonly logger: Logger;

  constructor(deps: OrderProjectionConsumerDeps) {
    this.consumer = deps.consumer;
    this.store = deps.store;
    this.topic = deps.topic;
    this.logger = deps.logger;
  }

  /**
   * TODO(5a): subscribe to this.topic and start consuming.
   *  - A brand-new projection must see the whole history: fromBeginning.
   *  - We commit offsets ourselves, after processing: autoCommit must be off.
   *  - Route each message to this.handle().
   */
  async start(): Promise<void> {
    throw new Error("Not implemented: TODO(5a)");
  }

  async stop(): Promise<void> {
    await this.consumer.disconnect();
  }

  /**
   * TODO(5b): process one record.
   *
   *  1. decodeOrderEvent(message). If it fails: logger.warn(...) with a context
   *     object containing at least { topic, partition, offset, reason }, commit,
   *     and return. (A record that can't be decoded will never succeed, so it
   *     must not block the partition.)
   *  2. If store.hasProcessed(eventId): it's a redelivery or a duplicate publish.
   *     Log at info, commit, return.
   *  3. Otherwise: read the customer's current totals, applyEvent(), store.save()
   *     (which also records the eventId).
   *  4. Commit ONLY after the save succeeded. If save() throws, let the error
   *     propagate: no commit, and the message will be retried.
   *
   * Committing: consumer.commitOffsets([{ topic, partition, offset }]) where
   * offset is the NEXT offset to read, i.e. message.offset + 1, as a string.
   * Offsets are 64-bit, so do the + 1 with BigInt.
   */
  async handle({ topic, partition, message }: EachMessagePayload): Promise<void> {
    throw new Error("Not implemented: TODO(5b)");
  }
}
