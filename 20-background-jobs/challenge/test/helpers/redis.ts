import type { Redis } from "ioredis";
import { connectRedis } from "../../src/lib/redis.js";

// Database 4 = module id 20 mod 16. Every key we write starts with wl:20.
export const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6380/4";

export async function testRedis(): Promise<Redis> {
  try {
    return await connectRedis(REDIS_URL);
  } catch (err) {
    throw new Error(`Redis not reachable at ${REDIS_URL}, run \`make up\` first. (${String(err)})`);
  }
}

export async function deletePrefix(redis: Redis, prefix: string): Promise<void> {
  let cursor = "0";
  do {
    const [next, keys] = await redis.scan(cursor, "MATCH", `${prefix}*`, "COUNT", 500);
    cursor = next;
    if (keys.length) await redis.del(...keys);
  } while (cursor !== "0");
}
