import { Redis } from "ioredis";
import { loadConfig } from "../../src/config.js";

export async function connectTestRedis(): Promise<Redis> {
  const { redisUrl } = loadConfig();
  const redis = new Redis(redisUrl, { lazyConnect: true, maxRetriesPerRequest: 1, retryStrategy: () => null });
  try {
    await redis.connect();
    await redis.ping();
  } catch (err) {
    redis.disconnect();
    throw new Error(`Redis not reachable at ${redisUrl}: run \`make up\` first (${(err as Error).message})`);
  }
  return redis;
}

/** Deletes every wl:18:* key (and nothing else). */
export async function flushModuleKeys(redis: Redis): Promise<void> {
  let cursor = "0";
  do {
    const [next, keys] = await redis.scan(cursor, "MATCH", "wl:18:*", "COUNT", 500);
    cursor = next;
    if (keys.length > 0) await redis.unlink(...keys);
  } while (cursor !== "0");
}
