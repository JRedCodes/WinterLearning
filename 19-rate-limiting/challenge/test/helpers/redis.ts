import { randomUUID } from "node:crypto";
import { Redis } from "ioredis";
import { connectRedis } from "../../src/lib/redis.js";

// Database 3 = module id 19 mod 16. Every key we write starts with wl:19:.
export const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6380/3";

export async function testRedis(): Promise<Redis> {
  try {
    return await connectRedis(REDIS_URL);
  } catch (err) {
    throw new Error(`Redis not reachable at ${REDIS_URL}, run \`make up\` first. (${String(err)})`);
  }
}

/** A fresh prefix per test, so tests never see each other's keys. */
export function uniquePrefix(): string {
  return `wl:19:test:${randomUUID().slice(0, 8)}:`;
}

/** Deletes every key under a prefix (SCAN, never KEYS, even in tests). */
export async function deletePrefix(redis: Redis, prefix: string): Promise<void> {
  let cursor = "0";
  do {
    const [next, keys] = await redis.scan(cursor, "MATCH", `${prefix}*`, "COUNT", 500);
    cursor = next;
    if (keys.length) await redis.del(...keys);
  } while (cursor !== "0");
}

export async function keysUnder(redis: Redis, prefix: string): Promise<string[]> {
  const found: string[] = [];
  let cursor = "0";
  do {
    const [next, keys] = await redis.scan(cursor, "MATCH", `${prefix}*`, "COUNT", 500);
    cursor = next;
    found.push(...keys);
  } while (cursor !== "0");
  return found;
}

/** A clock you move by hand: `clock.now = 5_000`, `clock.advance(250)`. */
export function fakeClock(start = 1_700_000_000_000) {
  const clock = {
    now: start,
    fn: () => clock.now,
    advance(ms: number) {
      clock.now += ms;
    },
  };
  return clock;
}

/** A client pointed at a port where nothing listens; every command fails fast. */
export function deadRedis(): Redis {
  const r = new Redis({
    port: 1,
    lazyConnect: true,
    enableOfflineQueue: false,
    maxRetriesPerRequest: 0,
    retryStrategy: () => null,
  });
  r.on("error", () => {});
  return r;
}
