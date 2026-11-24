import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Redis } from "ioredis";
import { connectTestRedis, flushModuleKeys } from "./helpers/redis.js";
import { addScore, rankOf, topN } from "../src/exercises/leaderboard.js";

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

async function seed() {
  await addScore(redis, "weekly", "ada", 50);
  await addScore(redis, "weekly", "grace", 80);
  await addScore(redis, "weekly", "linus", 30);
  await addScore(redis, "weekly", "barbara", 65);
}

describe("exercise 3 · leaderboard (SORTED SET)", () => {
  it("addScore accumulates points and returns the new score as a number", async () => {
    expect(await addScore(redis, "weekly", "ada", 10)).toBe(10);
    expect(await addScore(redis, "weekly", "ada", 5)).toBe(15);
    expect(await addScore(redis, "weekly", "ada", -3)).toBe(12);
  });

  it("stores the board as a sorted set at wl:17:leaderboard:<board>", async () => {
    await addScore(redis, "weekly", "ada", 10);
    expect(await redis.type("wl:17:leaderboard:weekly")).toBe("zset");
  });

  it("topN returns the n best players, highest first, with 1-based ranks", async () => {
    await seed();
    expect(await topN(redis, "weekly", 3)).toEqual([
      { player: "grace", score: 80, rank: 1 },
      { player: "barbara", score: 65, rank: 2 },
      { player: "ada", score: 50, rank: 3 },
    ]);
  });

  it("topN handles n larger than the board, n = 0, and empty boards", async () => {
    await seed();
    expect(await topN(redis, "weekly", 100)).toHaveLength(4);
    expect(await topN(redis, "weekly", 0)).toEqual([]);
    expect(await topN(redis, "empty", 5)).toEqual([]);
  });

  it("rankOf returns a 1-based rank, or null for unknown players", async () => {
    await seed();
    expect(await rankOf(redis, "weekly", "grace")).toBe(1);
    expect(await rankOf(redis, "weekly", "linus")).toBe(4);
    expect(await rankOf(redis, "weekly", "nobody")).toBeNull();
  });

  it("concurrent score updates are all counted", async () => {
    await Promise.all(Array.from({ length: 100 }, () => addScore(redis, "weekly", "ada", 1)));
    expect(await topN(redis, "weekly", 1)).toEqual([{ player: "ada", score: 100, rank: 1 }]);
  });
});
