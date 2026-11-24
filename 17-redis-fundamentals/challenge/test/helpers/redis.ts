import { Redis } from "ioredis";
import { loadConfig } from "../../src/config.js";
import { KEY_PREFIX } from "../../src/lib/keys.js";

/**
 * Connects to the module's Redis database or fails with a helpful message.
 */
export async function connectTestRedis(): Promise<Redis> {
  const { redisUrl } = loadConfig();
  const redis = new Redis(redisUrl, {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    retryStrategy: () => null, // don't retry forever when Redis is down
  });
  try {
    await redis.connect();
    await redis.ping();
  } catch (err) {
    redis.disconnect();
    const reason = err instanceof Error ? err.message : String(err);
    throw new Error(`Redis not reachable at ${redisUrl}: run \`make up\` first (${reason})`);
  }
  return redis;
}

/** Deletes every key under wl:17: (and nothing else). */
export async function flushModuleKeys(redis: Redis): Promise<void> {
  let cursor = "0";
  do {
    const [next, keys] = await redis.scan(cursor, "MATCH", `${KEY_PREFIX}*`, "COUNT", 500);
    cursor = next;
    if (keys.length > 0) await redis.unlink(...keys);
  } while (cursor !== "0");
}

export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
