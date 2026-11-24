import type { CustomerTotals } from "../domain/customerTotals.js";

/**
 * Where the projection keeps its read model AND the ids of the events it has
 * already applied. Keeping both in the same store is what makes "apply the
 * event + remember we applied it" one atomic step. With Postgres this would be
 * one transaction (module 33 builds exactly that as an "inbox" table).
 */
export interface ProjectionStore {
  hasProcessed(eventId: string): Promise<boolean>;
  get(customerId: string): Promise<CustomerTotals | undefined>;
  /** Atomically stores the new totals AND marks eventId as processed. */
  save(totals: CustomerTotals, eventId: string): Promise<void>;
  all(): Promise<CustomerTotals[]>;
}

export class InMemoryProjectionStore implements ProjectionStore {
  private readonly totals = new Map<string, CustomerTotals>();
  private readonly processed = new Set<string>();

  async hasProcessed(eventId: string): Promise<boolean> {
    return this.processed.has(eventId);
  }

  async get(customerId: string): Promise<CustomerTotals | undefined> {
    const row = this.totals.get(customerId);
    return row ? { ...row } : undefined;
  }

  async save(totals: CustomerTotals, eventId: string): Promise<void> {
    this.totals.set(totals.customerId, { ...totals });
    this.processed.add(eventId);
  }

  async all(): Promise<CustomerTotals[]> {
    return [...this.totals.values()]
      .map((t) => ({ ...t }))
      .sort((a, b) => a.customerId.localeCompare(b.customerId));
  }

  /** How many distinct events have been applied (handy in tests). */
  processedCount(): number {
    return this.processed.size;
  }
}
