import type { BackoffSettings } from "./types.js";

/**
 * TODO(1): Exponential backoff with FULL jitter.
 *
 *   ceiling = min(maxMs, baseMs × 2^(attemptsMade − 1))
 *   delay   = Math.floor(random() × ceiling)      → somewhere in [0, ceiling)
 *
 * `attemptsMade` = attempts that already failed (1 after the first failure).
 * That's what BullMQ passes to a custom backoffStrategy (see workers.ts).
 * Treat anything below 1 as 1. Use the injected `random` so tests are exact.
 *
 * Why jitter? Read the lesson, section 5: without it, 10,000 jobs that failed
 * together all retry together.
 */
export function computeBackoff(
  attemptsMade: number,
  settings: BackoffSettings,
  random: () => number = Math.random,
): number {
  void [attemptsMade, settings, random];
  throw new Error("Not implemented: computeBackoff (TODO 1)");
}
