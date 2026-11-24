import pg from "pg";
import request from "supertest";
import { buildContainer } from "../../src/container.js";
import { migrate } from "../../src/db/migrate.js";
import type { ConsumedEvent, EventBus } from "../../src/events/eventBus.js";
import { InMemoryEventBus } from "../../src/events/inMemoryEventBus.js";
import { orderPlacedMessage } from "../../src/events/orderEvents.js";
import { createPool, pgErrorCode } from "../../src/lib/db.js";

export const DATABASE_URL = process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5433/wl_33";
export const ORDERS_TOPIC = "orders.v1";
export const DLQ_TOPIC = "orders.v1.payments-dlq";

/** Drops everything and re-applies migrations/*.sql (including the ones you add). */
export async function resetDatabase(pool: pg.Pool): Promise<void> {
  await pool.query("DROP SCHEMA public CASCADE");
  await pool.query("CREATE SCHEMA public");
  await migrate(pool);
}

export interface Harness {
  pool: pg.Pool;
  bus: InMemoryEventBus;
  api: () => ReturnType<typeof request>;
  container: ReturnType<typeof buildContainer>;
  /** Rebuilds the container (e.g. with a different batch size or bus). */
  rebuild(options?: { relayBatchSize?: number; bus?: EventBus }): ReturnType<typeof buildContainer>;
  sql<T extends pg.QueryResultRow = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T[]>;
  close(): Promise<void>;
}

export function createHarness(): Harness {
  const pool = createPool(DATABASE_URL, 10);
  pool.on("error", () => {});
  const bus = new InMemoryEventBus();
  const h: Harness = {
    pool,
    bus,
    container: buildContainer({ pool, bus, ordersTopic: ORDERS_TOPIC }),
    api: () => request(h.container.app),
    rebuild(options = {}) {
      return buildContainer({ pool, bus: options.bus ?? bus, ordersTopic: ORDERS_TOPIC, relayBatchSize: options.relayBatchSize });
    },
    async sql(text, params) {
      try {
        const { rows } = await pool.query(text, params);
        return rows;
      } catch (err) {
        if (pgErrorCode(err) === "42P01") {
          throw new Error(
            `${(err as Error).message}. Did you add a migration (migrations/002_*.sql) that creates it? See CHALLENGE.md for the required columns.`,
          );
        }
        throw err;
      }
    },
    async close() {
      await pool.end();
    },
  };
  return h;
}

/** Fresh database + fresh fake bus for each test. */
export async function freshState(h: Harness): Promise<void> {
  await resetDatabase(h.pool);
  h.bus.published.length = 0;
  h.bus.publishCalls = 0;
  h.bus.delayMs = 0;
  h.bus.maxInFlight = 0;
  h.bus.heal();
  h.container = buildContainer({ pool: h.pool, bus: h.bus, ordersTopic: ORDERS_TOPIC });
}

export interface PlacedOrder {
  id: string;
  customerId: string;
  totalCents: number;
  currency: string;
}

export async function placeOrder(h: Harness, body: { customerId: string; items: { sku: string; quantity: number }[] }): Promise<PlacedOrder> {
  const res = await h.api().post("/orders").send(body);
  if (res.status !== 201) throw new Error(`POST /orders failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.data as PlacedOrder;
}

export interface OutboxRow {
  id: string;
  topic: string;
  message_key: string;
  payload: Record<string, unknown>;
  headers: Record<string, string>;
  published_at: Date | null;
}

export function outboxRows(h: Harness): Promise<OutboxRow[]> {
  return h.sql<OutboxRow>("SELECT id, topic, message_key, payload, headers, published_at FROM outbox ORDER BY id");
}

/** An OrderPlaced record as the payments consumer would receive it. */
export function orderPlacedRecord(options: {
  eventId: string;
  orderId: string;
  customerId?: string;
  amountCents?: number;
  currency?: string;
  offset?: string;
}): ConsumedEvent {
  const m = orderPlacedMessage({
    eventId: options.eventId,
    occurredAt: "2026-01-15T10:00:00.000Z",
    orderId: options.orderId,
    customerId: options.customerId ?? "cust-1",
    total: { amountCents: options.amountCents ?? 2500, currency: options.currency ?? "EUR" },
  });
  return { topic: ORDERS_TOPIC, partition: 0, offset: options.offset ?? "0", key: m.key, value: m.value, headers: m.headers };
}

/** An OrderPlaced in the OLD v1 shape (still in the topic from before the v2 rollout). */
export function orderPlacedV1Record(options: { eventId: string; orderId: string; customerId?: string; totalCents: number }): ConsumedEvent {
  const payload = {
    eventId: options.eventId,
    occurredAt: "2025-12-01T09:00:00.000Z",
    orderId: options.orderId,
    customerId: options.customerId ?? "cust-1",
    totalCents: options.totalCents,
  };
  return {
    topic: ORDERS_TOPIC,
    partition: 1,
    offset: "17",
    key: options.orderId,
    value: JSON.stringify(payload),
    headers: { "event-type": "OrderPlaced", "event-version": "1", "event-id": options.eventId, "content-type": "application/json" },
  };
}

export async function paymentsFor(h: Harness, orderId: string) {
  return h.sql<{ amount_cents: number; currency: string; event_id: string }>(
    "SELECT amount_cents, currency, event_id FROM payments WHERE order_id = $1 ORDER BY id",
    [orderId],
  );
}
