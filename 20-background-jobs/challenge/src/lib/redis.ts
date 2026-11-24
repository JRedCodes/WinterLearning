import { Redis } from "ioredis";

/** Plain connection options; BullMQ accepts this shape. */
export interface BullConnection {
  host: string;
  port: number;
  db: number;
  username?: string;
  password?: string;
}

/**
 * BullMQ wants connection OPTIONS (it opens its own connections: a Worker
 * needs a dedicated blocking connection for BRPOPLPUSH-style waits, and sets
 * `maxRetriesPerRequest: null` on it). So we turn the URL into options once
 * and hand the same object to every Queue and Worker.
 */
export function connectionFromUrl(url: string): BullConnection {
  const u = new URL(url);
  const db = u.pathname.length > 1 ? Number(u.pathname.slice(1)) : 0;
  const options: BullConnection = {
    host: u.hostname,
    port: u.port ? Number(u.port) : 6379,
    db,
  };
  if (u.password) options.password = decodeURIComponent(u.password);
  if (u.username) options.username = decodeURIComponent(u.username);
  return options;
}

/** A plain client for our own keys (idempotency). Connects eagerly; waits until ready. */
export async function connectRedis(url: string): Promise<Redis> {
  const redis = new Redis(url, { lazyConnect: true, maxRetriesPerRequest: 2 });
  await redis.connect();
  return redis;
}
