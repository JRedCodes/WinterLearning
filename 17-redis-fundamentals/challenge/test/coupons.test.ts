import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Redis } from "ioredis";
import { connectTestRedis, flushModuleKeys } from "./helpers/redis.js";
import { claimCoupon, claimLimitedCoupon, claimedCount } from "../src/exercises/coupons.js";

let redis: Redis;
beforeAll(async () => {
  redis = await connectTestRedis();
});
beforeEach(async () => {
  await flushModuleKeys(redis);
});
afterAll(async () => {
  await flushModuleKeys(redis);
  await redis.quit();
});

describe("exercise 7a · claim once (SET semantics)", () => {
  it("the first claim succeeds, later claims by the same user fail", async () => {
    expect(await claimCoupon(redis, "spring", "u1")).toBe(true);
    expect(await claimCoupon(redis, "spring", "u1")).toBe(false);
    expect(await claimCoupon(redis, "spring", "u2")).toBe(true);
    expect(await redis.smembers("wl:17:coupon:spring:claimed")).toEqual(expect.arrayContaining(["u1", "u2"]));
  });

  it("20 concurrent claims by one user produce exactly one success", async () => {
    const results = await Promise.all(Array.from({ length: 20 }, () => claimCoupon(redis, "spring", "u1")));
    expect(results.filter(Boolean)).toHaveLength(1);
  });

  it("claimedCount counts users", async () => {
    await claimCoupon(redis, "spring", "u1");
    await claimCoupon(redis, "spring", "u2");
    await claimCoupon(redis, "spring", "u1");
    expect(await claimedCount(redis, "spring")).toBe(2);
    expect(await claimedCount(redis, "unknown")).toBe(0);
  });
});

describe("exercise 7b · limited coupons (Lua)", () => {
  it("returns claimed / already_claimed / sold_out", async () => {
    expect(await claimLimitedCoupon(redis, "flash", "u1", 2)).toBe("claimed");
    expect(await claimLimitedCoupon(redis, "flash", "u1", 2)).toBe("already_claimed");
    expect(await claimLimitedCoupon(redis, "flash", "u2", 2)).toBe("claimed");
    expect(await claimLimitedCoupon(redis, "flash", "u3", 2)).toBe("sold_out");
    expect(await claimLimitedCoupon(redis, "flash", "u1", 2), "a winner is still 'already_claimed' after sell-out").toBe(
      "already_claimed",
    );
  });

  it("never oversells: 50 concurrent users, limit 10 → exactly 10 claimed", async () => {
    const results = await Promise.all(
      Array.from({ length: 50 }, (_, i) => claimLimitedCoupon(redis, "flash", `user-${i}`, 10)),
    );
    expect(results.filter((r) => r === "claimed")).toHaveLength(10);
    expect(results.filter((r) => r === "sold_out")).toHaveLength(40);
    expect(await claimedCount(redis, "flash")).toBe(10);
  });

  it("a user hammering the button concurrently still gets only one coupon", async () => {
    const results = await Promise.all(
      Array.from({ length: 20 }, () => claimLimitedCoupon(redis, "flash", "u1", 5)),
    );
    expect(results.filter((r) => r === "claimed")).toHaveLength(1);
    expect(results.filter((r) => r === "already_claimed")).toHaveLength(19);
  });
});
