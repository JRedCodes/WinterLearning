import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Redis } from "ioredis";
import { connectTestRedis, flushModuleKeys } from "./helpers/redis.js";
import { getViews, getViewsMany, recordView } from "../src/exercises/pageViews.js";

let redis: Redis;
beforeAll(async () => {
  redis = await connectTestRedis();
});
beforeEach(async () => {
  vi.restoreAllMocks();
  await flushModuleKeys(redis);
});
afterAll(async () => {
  await flushModuleKeys(redis);
  await redis.quit();
});

describe("exercise 1 · page views (STRING + INCR)", () => {
  it("recordView returns the running total", async () => {
    expect(await recordView(redis, "home")).toBe(1);
    expect(await recordView(redis, "home")).toBe(2);
    expect(await recordView(redis, "pricing")).toBe(1);
  });

  it("stores the counter at wl:17:views:<pageId>", async () => {
    await recordView(redis, "home");
    expect(await redis.get("wl:17:views:home")).toBe("1");
  });

  it("getViews returns 0 for a page nobody viewed", async () => {
    expect(await getViews(redis, "never-seen")).toBe(0);
  });

  it("never loses an update under concurrency (200 parallel views → 200)", async () => {
    await Promise.all(Array.from({ length: 200 }, () => recordView(redis, "hot")));
    expect(await getViews(redis, "hot")).toBe(200);
  });

  it("getViewsMany fetches many counters, defaulting missing pages to 0", async () => {
    await recordView(redis, "a");
    await recordView(redis, "a");
    await recordView(redis, "b");
    expect(await getViewsMany(redis, ["a", "b", "missing"])).toEqual({ a: 2, b: 1, missing: 0 });
  });

  it("getViewsMany uses one round trip instead of a GET per page", async () => {
    await recordView(redis, "a");
    const get = vi.spyOn(redis, "get");
    await getViewsMany(redis, ["a", "b", "c", "d"]);
    expect(get, "loop of GETs detected: use MGET (or a pipeline)").not.toHaveBeenCalled();
  });

  it("getViewsMany([]) returns {} without erroring", async () => {
    expect(await getViewsMany(redis, [])).toEqual({});
  });
});
