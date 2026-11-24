import type { Redis } from "ioredis";
import { key } from "../lib/keys.js";

/**
 * Exercise 7 · Claim a coupon once (SET semantics, then Lua for a limit)
 *
 * Key: wl:17:coupon:<campaignId>:claimed   (a set of user ids)
 */
export type ClaimResult = "claimed" | "already_claimed" | "sold_out";

/**
 * Part A: each user may claim the campaign's coupon at most once, unlimited
 * supply. Returns true for the first claim, false afterwards. Even 20
 * concurrent claims by the same user must produce exactly one `true`.
 * (One command is enough. Which command tells you whether it added something?)
 */
export async function claimCoupon(redis: Redis, campaignId: string, userId: string): Promise<boolean> {
  throw new Error("Not implemented: claimCoupon");
}

/**
 * Part B: same set, but only `limit` coupons exist in total.
 *   - user already in the set    -> "already_claimed"
 *   - set already has `limit`    -> "sold_out"
 *   - otherwise add the user     -> "claimed"
 *
 * 50 different users claiming at once with limit 10 must yield exactly 10
 * "claimed". Checking SCARD and then SADD from Node is a race: run the
 * check-and-add atomically in Redis.
 */
export async function claimLimitedCoupon(
  redis: Redis,
  campaignId: string,
  userId: string,
  limit: number,
): Promise<ClaimResult> {
  throw new Error("Not implemented: claimLimitedCoupon");
}

/** How many users have claimed the campaign's coupon. */
export async function claimedCount(redis: Redis, campaignId: string): Promise<number> {
  throw new Error("Not implemented: claimedCount");
}

void key;
