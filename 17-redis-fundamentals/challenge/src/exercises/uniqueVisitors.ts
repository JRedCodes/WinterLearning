import type { Redis } from "ioredis";
import { key } from "../lib/keys.js";

/**
 * Exercise 4 · Unique visitors (HYPERLOGLOG)
 *
 * Key: wl:17:visitors:<day>   e.g. wl:17:visitors:2026-01-15
 *
 * Why HyperLogLog: counting distinct items exactly needs memory proportional
 * to the number of items (a SET of 10M ids is hundreds of MB). An HLL uses at
 * most ~12 KB per key and answers "how many distinct?" with ~0.81% standard
 * error. Perfect for analytics, wrong for anything that must be exact.
 */

/**
 * Record that `visitorId` visited on `day`.
 * Returns true if the HLL changed (the visitor was *probably* new).
 */
export async function trackVisit(redis: Redis, day: string, visitorId: string): Promise<boolean> {
  throw new Error("Not implemented: trackVisit");
}

/** Approximate number of distinct visitors on `day` (0 if none). */
export async function countUnique(redis: Redis, day: string): Promise<number> {
  throw new Error("Not implemented: countUnique");
}

/**
 * Approximate number of distinct visitors across several days: a visitor
 * seen on Monday AND Tuesday counts once. One command, no loops.
 * An empty list returns 0.
 */
export async function countUniqueAcross(redis: Redis, days: string[]): Promise<number> {
  throw new Error("Not implemented: countUniqueAcross");
}

void key;
