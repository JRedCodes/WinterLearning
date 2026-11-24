import type { RetryBudget } from "./retryBudget.js";

export interface BackoffOptions {
  /** Delay before the first retry (before jitter). */
  baseDelayMs: number;
  /** Upper bound for any single delay (before jitter). */
  maxDelayMs: number;
  /** "full": random delay in [0, computed). "none": exactly the computed delay. Default "full". */
  jitter?: "full" | "none";
  /** Injected for deterministic tests. Default Math.random. */
  random?: () => number;
}

export interface RetryOptions extends BackoffOptions {
  /** Total attempts including the first one. 1 = no retries. */
  attempts: number;
  /** Return false for errors that must not be retried. Default: retry everything. */
  retryOn?: (error: unknown) => boolean;
  /** Shared budget across calls. When empty, failures are not retried. */
  budget?: RetryBudget;
  /** Injected for tests. Default: a setTimeout-based sleep. */
  sleep?: (ms: number) => Promise<void>;
  /** Observability hook, called before each retry. */
  onRetry?: (info: { attempt: number; delayMs: number; error: unknown }) => void;
}

/**
 * TODO(2a): the delay to wait after failed attempt number `attempt` (1-based):
 *   capped = min(maxDelayMs, baseDelayMs * 2^(attempt-1))
 *   jitter "full" (the default) → Math.floor(random() * capped)
 *   jitter "none"               → capped
 */
export function backoffDelay(attempt: number, options: BackoffOptions): number {
  throw new Error("Not implemented");
}

/**
 * TODO(2b): call fn(attempt) (attempt = 1, 2, ...) until it succeeds.
 *
 * - On success: budget?.recordSuccess(), return the result.
 * - On failure, rethrow the error UNCHANGED (no wrapping) when:
 *     this was the last attempt, or retryOn(error) is false,
 *     or a budget is given and budget.tryAcquire() returns false.
 * - Otherwise: delay = backoffDelay(attempt, options), call onRetry, sleep(delay), try again.
 * - Default sleep: a promise around setTimeout (the tests use fake timers for it).
 */
export async function retry<T>(fn: (attempt: number) => Promise<T>, options: RetryOptions): Promise<T> {
  throw new Error("Not implemented");
}
