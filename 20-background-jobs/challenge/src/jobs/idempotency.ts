import type { Redis } from "ioredis";

/**
 * - "acquired": you hold the claim; do the side effect, then complete() or release().
 * - "done":     someone already did it; skip.
 * - "busy":     someone is doing it right now; don't duplicate, retry later.
 */
export type ClaimResult = "acquired" | "done" | "busy";

export interface IdempotencyStore {
  claim(key: string, leaseMs: number): Promise<ClaimResult>;
  complete(key: string, ttlMs: number): Promise<void>;
  release(key: string): Promise<void>;
}

/**
 * TODO(4): Processed-job keys in Redis. Every key is `${prefix}${key}`.
 *
 * claim(key, leaseMs)
 *   Atomically mark the key "in-progress" for leaseMs, ONLY IF it doesn't
 *   exist (one command: SET ... PX ... NX). Then:
 *     set succeeded         → "acquired"
 *     existing value "done" → "done"
 *     anything else         → "busy"
 *   The lease means a worker that crashes mid-job doesn't block the work forever.
 *
 * complete(key, ttlMs)
 *   Overwrite with "done" for ttlMs (how long we remember it was done).
 *
 * release(key)
 *   Delete the key, but ONLY if it's still "in-progress" (a "done" marker must
 *   survive). Compare-and-delete must be atomic → a tiny Lua script.
 */
export class RedisIdempotencyStore implements IdempotencyStore {
  constructor(
    private readonly redis: Redis,
    private readonly prefix = "wl:20:idem:",
  ) {}

  async claim(key: string, leaseMs: number): Promise<ClaimResult> {
    void [this.redis, this.prefix, key, leaseMs];
    throw new Error("Not implemented: RedisIdempotencyStore.claim (TODO 4)");
  }

  async complete(key: string, ttlMs: number): Promise<void> {
    void [key, ttlMs];
    throw new Error("Not implemented: RedisIdempotencyStore.complete (TODO 4)");
  }

  async release(key: string): Promise<void> {
    void key;
    throw new Error("Not implemented: RedisIdempotencyStore.release (TODO 4)");
  }
}
