import { BulkheadFullError } from "./errors.js";

export interface BulkheadOptions {
  /** Calls allowed to run at the same time. */
  maxConcurrent: number;
  /** Calls allowed to wait for a slot. Beyond this, calls are rejected immediately. */
  maxQueue: number;
}

/**
 * TODO(5): limit concurrent calls to one dependency.
 *
 * - Fewer than maxConcurrent running → run fn now.
 * - Otherwise, fewer than maxQueue waiting → wait in a FIFO queue for a slot.
 * - Otherwise → reject immediately with BulkheadFullError (load shedding).
 * - When fn settles (success OR failure), free the slot and start the next waiter.
 * - `active` = running now, `queued` = waiting now.
 */
export class Bulkhead {
  constructor(private readonly options: BulkheadOptions) {}

  get active(): number {
    throw new Error("Not implemented");
  }

  get queued(): number {
    throw new Error("Not implemented");
  }

  async run<T>(fn: () => Promise<T>): Promise<T> {
    throw new Error("Not implemented");
  }
}

// Remove once you use it.
void BulkheadFullError;
