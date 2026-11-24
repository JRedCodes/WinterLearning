import { CircuitOpenError } from "./errors.js";

export type BreakerState = "closed" | "open" | "half_open";

export interface CircuitBreakerOptions {
  /** Consecutive failures that open the circuit. */
  failureThreshold: number;
  /** How long the circuit stays open before allowing a trial call. */
  resetTimeoutMs: number;
  /** Injected clock. Default Date.now. */
  now?: () => number;
  /** Which errors count as a downstream failure. Default: all. A "not found" is a healthy answer. */
  isFailure?: (error: unknown) => boolean;
  /** Observability hook. */
  onStateChange?: (from: BreakerState, to: BreakerState) => void;
}

/**
 * TODO(4): a circuit breaker.
 *
 * closed ──(failureThreshold CONSECUTIVE failures)──▶ open
 * open ──(resetTimeoutMs elapsed)──▶ half_open
 * half_open ──(trial succeeds)──▶ closed
 * half_open ──(trial fails)──▶ open (the timer restarts)
 *
 * - closed: run fn. A success resets the failure count. An error for which
 *   isFailure(error) is false counts as a success (the downstream answered).
 * - open: don't call fn; throw new CircuitOpenError(ms left until half_open).
 * - half_open: let exactly ONE trial call run; concurrent calls get CircuitOpenError.
 * - `state` reports "half_open" as soon as resetTimeoutMs has passed, even
 *   before the next call (that transition fires onStateChange too).
 * - Always rethrow fn's error unchanged. Call onStateChange(from, to) on every transition.
 */
export class CircuitBreaker {
  constructor(private readonly options: CircuitBreakerOptions) {}

  get state(): BreakerState {
    throw new Error("Not implemented");
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    throw new Error("Not implemented");
  }
}

// Remove once you use it.
void CircuitOpenError;
