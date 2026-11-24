import type { EventBus, EventHandler } from "../events/eventBus.js";
import { silentLogger, type Logger } from "../lib/logger.js";

export interface DeadLetterOptions {
  bus: EventBus;
  /** Where messages that can't be processed are parked, e.g. "orders.v1.payments-dlq". */
  dlqTopic: string;
  /** Total attempts (first try included) before giving up on a message. */
  maxAttempts: number;
  /** Base delay of the exponential backoff between attempts. */
  backoffMs?: number;
  logger?: Logger;
  /** Injected so tests don't actually wait. */
  sleep?: (ms: number) => Promise<void>;
  now?: () => Date;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Wraps a consumer handler with retries.
 *
 * Kafka messages must never be dropped, so we keep retrying (with backoff)
 * until the handler succeeds. The offset is only committed once this resolves.
 */
export function withDeadLetter(handler: EventHandler, options: DeadLetterOptions): EventHandler {
  const sleep = options.sleep ?? defaultSleep;
  const logger = options.logger ?? silentLogger;
  const backoffMs = options.backoffMs ?? 100;

  return async (event) => {
    for (let attempt = 1; ; attempt++) {
      try {
        await handler(event);
        return;
      } catch (err) {
        logger.warn("handler failed, retrying", {
          topic: event.topic,
          partition: event.partition,
          offset: event.offset,
          attempt,
          error: (err as Error).message,
        });
        await sleep(Math.min(backoffMs * 2 ** (attempt - 1), 30_000));
      }
    }
  };
}
