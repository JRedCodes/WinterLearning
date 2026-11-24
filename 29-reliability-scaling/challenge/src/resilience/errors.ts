/** Errors raised by the resilience primitives themselves (not by downstreams). */

export class TimeoutError extends Error {
  override readonly name = "TimeoutError";
  constructor(readonly timeoutMs: number) {
    super(`Timed out after ${timeoutMs}ms`);
  }
}

export class CircuitOpenError extends Error {
  override readonly name = "CircuitOpenError";
  constructor(
    /** Roughly how long until the breaker lets a trial call through. */
    readonly retryAfterMs: number,
  ) {
    super(`Circuit is open, retry in ${retryAfterMs}ms`);
  }
}

export class BulkheadFullError extends Error {
  override readonly name = "BulkheadFullError";
  constructor() {
    super("Bulkhead is full (max concurrent calls and queue reached)");
  }
}
