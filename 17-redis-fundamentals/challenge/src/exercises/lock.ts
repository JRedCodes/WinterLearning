import { randomUUID } from "node:crypto";
import type { Redis } from "ioredis";
import { key } from "../lib/keys.js";

/**
 * Exercise 6 · A simple distributed lock (SET NX PX + Lua release)
 *
 * Key: wl:17:lock:<resource>   (value = a random token owned by the holder)
 *
 * This is the single-instance lock pattern: good enough to stop two workers
 * from running the same nightly job at once. It is NOT a correctness
 * guarantee for things like money (read docs/atomicity-and-lua.md for why).
 */
export class LockNotAcquiredError extends Error {
  constructor(public readonly resource: string) {
    super(`Lock on "${resource}" is held by someone else`);
    this.name = "LockNotAcquiredError";
  }
}

/**
 * Try to take the lock for `ttlMs` milliseconds.
 * Returns a random token if acquired, or null if someone else holds it.
 * Must be ONE atomic command: "check if free, then set" as two commands is a race.
 */
export async function acquireLock(
  redis: Redis,
  resource: string,
  ttlMs: number,
): Promise<string | null> {
  throw new Error("Not implemented: acquireLock");
}

/**
 * Release the lock ONLY if we still own it (the stored value equals `token`).
 * Returns true if we released it.
 *
 * GET-then-DEL from Node is a race: our lock may expire between the two
 * commands, someone else acquires it, and we delete THEIR lock. The compare
 * and the delete must run atomically inside Redis, so use a Lua script.
 */
export async function releaseLock(redis: Redis, resource: string, token: string): Promise<boolean> {
  throw new Error("Not implemented: releaseLock");
}

/**
 * Run `fn` while holding the lock and always release it afterwards, even if
 * `fn` throws. If the lock is busy, throw LockNotAcquiredError without
 * calling `fn`.
 */
export async function withLock<T>(
  redis: Redis,
  resource: string,
  ttlMs: number,
  fn: () => Promise<T>,
): Promise<T> {
  throw new Error("Not implemented: withLock");
}

void key;
void randomUUID;
