import type pg from "pg";
import { createApp } from "./app.js";
import type { EventBus } from "./events/eventBus.js";
import { silentLogger, type Logger } from "./lib/logger.js";
import { OrderService } from "./orders/orderService.js";
import { OutboxRelay } from "./outbox/outboxRelay.js";
import { PaymentsHandler } from "./payments/paymentsHandler.js";

export interface ContainerDeps {
  pool: pg.Pool;
  bus: EventBus;
  ordersTopic: string;
  relayBatchSize?: number;
  logger?: Logger;
}

/**
 * Wires the object graph. Used by server.ts (with the real Kafka bus) and by
 * the tests (with InMemoryEventBus). In production, orders and payments would
 * be separate deployables; here they share a process to keep things small.
 */
export function buildContainer(deps: ContainerDeps) {
  const logger = deps.logger ?? silentLogger;
  const orderService = new OrderService({ pool: deps.pool, bus: deps.bus, ordersTopic: deps.ordersTopic });
  const relay = new OutboxRelay({ pool: deps.pool, bus: deps.bus, batchSize: deps.relayBatchSize, logger });
  const payments = new PaymentsHandler({ pool: deps.pool, logger });
  const app = createApp({ orderService, logger });
  return { app, orderService, relay, payments };
}
