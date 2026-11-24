import type { Redis } from "ioredis";
import { key } from "../lib/keys.js";

/**
 * Exercise 5 · Recent activity feed (capped LIST)
 *
 * Key: wl:17:feed:<userId>   (a list of JSON strings, newest at the head)
 *
 * Why a capped list: "the last 50 things this user did" is a classic
 * Redis job. LPUSH puts the newest item at index 0 and LTRIM throws away
 * everything past the cap, so the list never grows without bound.
 */
export interface Activity {
  type: string;
  /** Unix epoch milliseconds. */
  at: number;
  data?: Record<string, unknown>;
}

/**
 * Push an activity onto the user's feed and cap the feed at `maxLength`
 * entries. Push and trim must happen together (MULTI/EXEC) so no reader ever
 * sees an over-long list and a crash can't skip the trim.
 */
export async function pushActivity(
  redis: Redis,
  userId: string,
  activity: Activity,
  maxLength = 50,
): Promise<void> {
  throw new Error("Not implemented: pushActivity");
}

/** The `limit` most recent activities, newest first. Empty feed returns []. */
export async function recentActivity(
  redis: Redis,
  userId: string,
  limit = 10,
): Promise<Activity[]> {
  throw new Error("Not implemented: recentActivity");
}

void key;
