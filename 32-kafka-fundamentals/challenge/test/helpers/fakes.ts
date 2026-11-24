import type { CustomerTotals } from "../../src/domain/customerTotals.js";
import type { OrderEventInput } from "../../src/domain/orderEvents.js";
import type { Logger } from "../../src/messaging/types.js";
import { InMemoryProjectionStore } from "../../src/projection/projectionStore.js";

export interface LogEntry {
  level: "info" | "warn" | "error";
  message: string;
  context: Record<string, unknown>;
}

/** A logger that remembers what was logged, so tests can assert on it. */
export function recordingLogger(): Logger & { entries: LogEntry[] } {
  const entries: LogEntry[] = [];
  const at = (level: LogEntry["level"]) => (message: string, context: Record<string, unknown> = {}) => {
    entries.push({ level, message, context });
  };
  return { entries, info: at("info"), warn: at("warn"), error: at("error") };
}

/** A projection store whose save() can be told to fail (a database outage). */
export class FlakyProjectionStore extends InMemoryProjectionStore {
  failSaves = 0;
  saveCalls = 0;
  override async save(totals: CustomerTotals, eventId: string): Promise<void> {
    this.saveCalls++;
    if (this.failSaves > 0) {
      this.failSaves--;
      throw new Error("simulated database outage");
    }
    await super.save(totals, eventId);
  }
}

/** Deterministic id generator: evt-1, evt-2, ... */
export function sequentialIds(prefix = "evt"): () => string {
  let n = 0;
  return () => `${prefix}-${++n}`;
}

export const FIXED_NOW = new Date("2026-01-15T10:00:00.000Z");

export function placed(orderId: string, customerId: string, totalCents: number, extra: Partial<OrderEventInput> = {}): OrderEventInput {
  return { type: "OrderPlaced", orderId, customerId, totalCents, ...extra } as OrderEventInput;
}

export function cancelled(orderId: string, customerId: string, totalCents: number, reason = "customer request"): OrderEventInput {
  return { type: "OrderCancelled", orderId, customerId, totalCents, reason };
}
