import type { Redis } from "ioredis";
import { key } from "../lib/keys.js";

/**
 * Exercise 1 · Page view counter (STRING + INCR)
 *
 * Key: wl:17:views:<pageId>   (a string holding an integer)
 *
 * Why Redis: INCR is a single atomic command, so 1,000 concurrent requests
 * produce exactly +1,000. A "read, add one, write back" in app code would lose
 * updates under concurrency.
 */

/** Count one view of `pageId` and return the new total. */
export async function recordView(redis: Redis, pageId: string): Promise<number> {
  throw new Error("Not implemented: recordView");
}

/** Current total for `pageId`. A page that was never viewed has 0 views. */
export async function getViews(redis: Redis, pageId: string): Promise<number> {
  throw new Error("Not implemented: getViews");
}

/**
 * Totals for many pages in ONE round trip (don't loop over GET).
 * Returns an object keyed by page id; missing pages map to 0.
 * An empty input returns {} (careful: MGET with zero keys is an error).
 */
export async function getViewsMany(
  redis: Redis,
  pageIds: string[],
): Promise<Record<string, number>> {
  throw new Error("Not implemented: getViewsMany");
}

// Keeps `key` imported for you; remove once you use it.
void key;
