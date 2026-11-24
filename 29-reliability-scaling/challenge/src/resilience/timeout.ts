import { TimeoutError } from "./errors.js";

/**
 * TODO(1): run `fn` with a deadline.
 *
 * - Call fn right away with an AbortSignal. fn should pass it on
 *   (fetch(url, { signal })) so giving up actually cancels the work.
 * - If fn settles within `ms`: resolve/reject with its result/error, unchanged.
 * - Otherwise: abort the signal with a TimeoutError(ms) as the reason and
 *   reject with that same TimeoutError.
 * - A synchronous throw inside fn must become a rejection, not escape.
 * - Never leave a timer running after the promise settles.
 */
export async function withTimeout<T>(fn: (signal: AbortSignal) => Promise<T>, ms: number): Promise<T> {
  throw new Error("Not implemented");
}

// Remove once you use it.
void TimeoutError;
