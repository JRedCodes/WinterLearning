import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Redis } from "ioredis";
import { RedisHistoryRepository } from "../src/repositories/redisHistoryRepository.js";
import { deletePrefix, testRedis, uniquePrefix } from "./helpers/redis.js";

describe("RedisHistoryRepository (TODO 4)", () => {
  let redis: Redis;
  let prefix: string;
  let repo: RedisHistoryRepository;

  beforeAll(async () => {
    redis = await testRedis();
  });
  afterAll(() => redis.quit());
  beforeEach(() => {
    prefix = uniquePrefix();
    repo = new RedisHistoryRepository({ redis, prefix, maxMessages: 5 });
  });
  afterEach(() => deletePrefix(redis, prefix));

  const draft = (room: string, text: string, ts = 1000) => ({ room, user: "ada", text, ts });

  it("assigns ids 1, 2, 3... per room and returns the stored message", async () => {
    const first = await repo.append(draft("general", "hello", 111));
    const second = await repo.append(draft("general", "again", 222));
    const other = await repo.append(draft("random", "elsewhere"));
    expect(first).toEqual({ id: 1, room: "general", user: "ada", text: "hello", ts: 111 });
    expect(second.id).toBe(2);
    expect(other.id, "each room has its own sequence").toBe(1);
  });

  it("returns recent history oldest first", async () => {
    await repo.append(draft("general", "a"));
    await repo.append(draft("general", "b"));
    await repo.append(draft("general", "c"));
    const recent = await repo.recent("general");
    expect(recent.map((m) => m.text)).toEqual(["a", "b", "c"]);
    expect(recent.map((m) => m.id)).toEqual([1, 2, 3]);
  });

  it("keeps only the last maxMessages messages (trimmed in Redis, not just on read)", async () => {
    for (let i = 1; i <= 8; i++) await repo.append(draft("general", `m${i}`));
    const recent = await repo.recent("general");
    expect(recent.map((m) => m.id)).toEqual([4, 5, 6, 7, 8]);
    const keys = await redis.keys(`${prefix}*`);
    const listKey = keys.find((k) => (k.includes("general")) && !k.endsWith("seq"));
    expect(listKey, `expected a history key for "general" under ${prefix}; found ${keys.join(", ")}`).toBeDefined();
    expect(await redis.llen(listKey!)).toBe(5);
  });

  it("returns an empty array for a room with no messages", async () => {
    expect(await repo.recent("nobody-here")).toEqual([]);
  });

  it("since(lastId) returns only newer retained messages", async () => {
    for (let i = 1; i <= 4; i++) await repo.append(draft("general", `m${i}`));
    expect((await repo.since("general", 2)).map((m) => m.id)).toEqual([3, 4]);
    expect(await repo.since("general", 4)).toEqual([]);
    expect((await repo.since("general", 0)).map((m) => m.id)).toEqual([1, 2, 3, 4]);
  });

  it("keeps ids unique and history ordered under concurrent appends (atomic)", async () => {
    const big = new RedisHistoryRepository({ redis, prefix, maxMessages: 50 });
    const results = await Promise.all(
      Array.from({ length: 40 }, (_, i) => big.append(draft("busy", `c${i}`))),
    );
    const ids = results.map((m) => m.id).sort((a, b) => a - b);
    expect(ids).toEqual(Array.from({ length: 40 }, (_, i) => i + 1));
    const stored = (await big.recent("busy")).map((m) => m.id);
    expect(stored, "list order must equal id order").toEqual(ids);
  });

  it("stores everything under the given prefix", async () => {
    await repo.append(draft("general", "a"));
    const keys = await redis.keys(`${prefix}*`);
    expect(keys.length).toBeGreaterThanOrEqual(1);
    for (const key of keys) expect(key.startsWith(prefix)).toBe(true);
  });

  it("round-trips text with quotes, unicode and newlines", async () => {
    const text = 'she said "hi" 👋\nnew line, \\ backslash';
    await repo.append(draft("general", text));
    expect((await repo.recent("general"))[0]?.text).toBe(text);
  });
});
