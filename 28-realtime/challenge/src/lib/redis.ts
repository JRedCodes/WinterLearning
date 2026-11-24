import { Redis } from "ioredis";

/**
 * Connects an ioredis client and waits until it is ready.
 *
 * `lazyConnect` + an explicit `await connect()` means startup fails loudly if
 * Redis is down, instead of the first chat message hanging.
 *
 * A Redis connection that has called SUBSCRIBE can't run normal commands any
 * more, which is why the composition root opens TWO connections: one for
 * commands (history, PUBLISH) and one dedicated subscriber.
 */
export async function connectRedis(url: string): Promise<Redis> {
  const redis = new Redis(url, { lazyConnect: true, maxRetriesPerRequest: 2 });
  await redis.connect();
  return redis;
}
