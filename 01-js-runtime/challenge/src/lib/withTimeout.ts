/** Thrown when an operation takes longer than its deadline. */
export class TimeoutError extends Error {
  override name = "TimeoutError";
  readonly ms: number;

  constructor(ms: number) {
    super(`Operation timed out after ${ms}ms`);
    this.ms = ms;
  }
}

/**
 * Runs `fn` with a deadline.
 *
 * - `fn` receives an AbortSignal. Well-behaved operations (fetch, timers/promises, most modern
 *   Node APIs) stop work when it fires.
 * - If `fn` settles within `ms`, its result (or error) is passed through.
 * - Otherwise the signal is aborted and the returned promise rejects with a TimeoutError.
 */
export async function withTimeout<T>(fn: (signal: AbortSignal) => Promise<T>, ms: number): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new TimeoutError(ms)), ms);
  try {
    return await fn(controller.signal);
  } finally {
    clearTimeout(timer);
  }
}
