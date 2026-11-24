import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Redis } from "ioredis";
import { connectTestRedis, flushModuleKeys } from "./helpers/redis.js";
import { pushActivity, recentActivity, type Activity } from "../src/exercises/activityFeed.js";

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

const act = (i: number): Activity => ({ type: "comment", at: 1_700_000_000_000 + i, data: { n: i } });

describe("exercise 5 · activity feed (capped LIST)", () => {
  it("stores the feed as a list at wl:17:feed:<userId>", async () => {
    await pushActivity(redis, "u1", act(1));
    expect(await redis.type("wl:17:feed:u1")).toBe("list");
  });

  it("returns activities newest first, as objects", async () => {
    for (let i = 1; i <= 3; i++) await pushActivity(redis, "u1", act(i));
    expect(await recentActivity(redis, "u1", 10)).toEqual([act(3), act(2), act(1)]);
  });

  it("respects the limit", async () => {
    for (let i = 1; i <= 8; i++) await pushActivity(redis, "u1", act(i));
    const recent = await recentActivity(redis, "u1", 5);
    expect(recent.map((a) => a.at)).toEqual([8, 7, 6, 5, 4].map((i) => 1_700_000_000_000 + i));
  });

  it("caps the list at maxLength (default 50)", async () => {
    for (let i = 1; i <= 60; i++) await pushActivity(redis, "u1", act(i));
    expect(await redis.llen("wl:17:feed:u1")).toBe(50);
    const all = await recentActivity(redis, "u1", 100);
    expect(all[0]).toEqual(act(60));
    expect(all.at(-1), "the OLDEST entries should be the ones trimmed").toEqual(act(11));
  });

  it("supports a custom maxLength", async () => {
    for (let i = 1; i <= 10; i++) await pushActivity(redis, "u1", act(i), 3);
    expect(await redis.llen("wl:17:feed:u1")).toBe(3);
  });

  it("returns [] for an empty feed", async () => {
    expect(await recentActivity(redis, "nobody")).toEqual([]);
  });
});
