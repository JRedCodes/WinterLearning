import { Redis } from "ioredis";

/**
 * Creates an ioredis client.
 *
 * - `lazyConnect` means nothing happens until the first command (or an
 *   explicit `connect()`), so importing this file never opens a socket.
 * - `maxRetriesPerRequest: 1` makes a command fail fast when Redis is down
 *   instead of queueing forever. In a long-running server you might allow
 *   more retries; for scripts and tests, failing loudly is what you want.
 */
export function createRedis(url: string): Redis {
  return new Redis(url, {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
  });
}
