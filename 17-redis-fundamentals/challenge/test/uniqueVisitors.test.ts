import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Redis } from "ioredis";
import { connectTestRedis, flushModuleKeys } from "./helpers/redis.js";
import { countUnique, countUniqueAcross, trackVisit } from "../src/exercises/uniqueVisitors.js";

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

describe("exercise 4 · unique visitors (HYPERLOGLOG)", () => {
  it("uses a HyperLogLog at wl:17:visitors:<day>", async () => {
    await trackVisit(redis, "2026-01-15", "v1");
    // HLLs are stored as strings, but PFCOUNT only works on valid HLL data.
    expect(await redis.type("wl:17:visitors:2026-01-15")).toBe("string");
    expect(await redis.pfcount("wl:17:visitors:2026-01-15")).toBe(1);
  });

  it("trackVisit reports whether the visitor was (probably) new", async () => {
    expect(await trackVisit(redis, "2026-01-15", "v1")).toBe(true);
    expect(await trackVisit(redis, "2026-01-15", "v1")).toBe(false);
  });

  it("countUnique ignores repeat visits", async () => {
    for (const v of ["a", "b", "a", "c", "b", "a"]) await trackVisit(redis, "2026-01-15", v);
    expect(await countUnique(redis, "2026-01-15")).toBe(3);
    expect(await countUnique(redis, "2026-01-16")).toBe(0);
  });

  it("estimates large counts within 2%", async () => {
    const tasks: Promise<boolean>[] = [];
    for (let i = 0; i < 3000; i++) {
      tasks.push(trackVisit(redis, "2026-01-15", `visitor-${i}`));
      if (i % 3 === 0) tasks.push(trackVisit(redis, "2026-01-15", `visitor-${i}`)); // repeats
    }
    await Promise.all(tasks);
    const estimate = await countUnique(redis, "2026-01-15");
    expect(Math.abs(estimate - 3000) / 3000).toBeLessThan(0.02);
  });

  it("countUniqueAcross counts a visitor seen on several days once", async () => {
    await trackVisit(redis, "mon", "alice");
    await trackVisit(redis, "mon", "bob");
    await trackVisit(redis, "tue", "bob");
    await trackVisit(redis, "tue", "carol");
    expect(await countUniqueAcross(redis, ["mon", "tue"])).toBe(3);
    expect(await countUniqueAcross(redis, [])).toBe(0);
  });

  it("countUniqueAcross does not modify the per-day counts", async () => {
    await trackVisit(redis, "mon", "alice");
    await trackVisit(redis, "tue", "bob");
    await countUniqueAcross(redis, ["mon", "tue"]);
    expect(await countUnique(redis, "mon")).toBe(1);
  });
});
