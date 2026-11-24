import { randomUUID } from "node:crypto";
import type { Redis } from "ioredis";
import { connectRedis } from "../../src/lib/redis.js";

// Database 12 = module id 28 mod 16. Every key and channel we use starts with wl:28:.
export const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6380/12";

export async function testRedis(): Promise<Redis> {
  try {
    return await connectRedis(REDIS_URL);
  } catch (err) {
    throw new Error(`Redis not reachable at ${REDIS_URL}, run \`make up\` first. (${String(err)})`);
  }
}

/** A fresh prefix per test, so tests never see each other's keys or pub/sub events. */
export function uniquePrefix(): string {
  return `wl:28:test:${randomUUID().slice(0, 8)}:`;
}

export async function deletePrefix(redis: Redis, prefix: string): Promise<void> {
  let cursor = "0";
  do {
    const [next, keys] = await redis.scan(cursor, "MATCH", `${prefix}*`, "COUNT", 500);
    cursor = next;
    if (keys.length) await redis.del(...keys);
  } while (cursor !== "0");
}
