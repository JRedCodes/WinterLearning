import { Redis } from "ioredis";

/**
 * Connects an ioredis client and waits until it is ready.
 *
 * Two options matter for a rate limiter:
 * - `enableOfflineQueue: false`: when the connection is down, commands fail
 *   immediately instead of piling up in memory waiting for a reconnect. A
 *   limiter that waits 30 seconds for Redis is worse than no limiter, because
 *   every request stalls. Failing fast lets the middleware decide (fail open or
 *   fail closed) in microseconds.
 * - `maxRetriesPerRequest: 1`: same idea for commands in flight when the
 *   connection drops.
 *
 * Because the offline queue is off, we must wait for "ready" before using the
 * client, hence `lazyConnect` + an explicit `await connect()`.
 */
export async function connectRedis(url: string): Promise<Redis> {
  const redis = new Redis(url, {
    lazyConnect: true,
    enableOfflineQueue: false,
    maxRetriesPerRequest: 1,
  });
  await redis.connect();
  return redis;
}
