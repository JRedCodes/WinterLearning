import { randomUUID } from "node:crypto";
import type { Redis } from "ioredis";
import { key } from "../lib/keys.js";

/**
 * Exercise 2 · Session store (HASH + TTL)
 *
 * Key: wl:17:session:<sessionId>   (a hash with fields userId, role, createdAt)
 *
 * Why a hash: you can read or update one field without rewriting the whole
 * session, and it maps naturally to an object. The TTL makes abandoned
 * sessions disappear on their own: no cleanup job needed.
 */
export interface SessionData {
  userId: string;
  role: string;
  /** Unix epoch milliseconds. */
  createdAt: number;
}

export interface NewSession {
  userId: string;
  role: string;
}

/**
 * Create a session with a fresh random id (use randomUUID) and return the id.
 * The hash and its expiry must be written ATOMICALLY: a crash between "write
 * hash" and "set expiry" must never leave an immortal session behind.
 * `now` is injectable so tests are deterministic.
 */
export async function createSession(
  redis: Redis,
  data: NewSession,
  ttlSeconds: number,
  now: number = Date.now(),
): Promise<string> {
  throw new Error("Not implemented: createSession");
}

/**
 * Load a session, or null if it doesn't exist (or expired).
 * Watch out: HGETALL on a missing key returns {}, not null.
 * Hash values come back as strings, so convert createdAt to a number.
 */
export async function getSession(redis: Redis, sessionId: string): Promise<SessionData | null> {
  throw new Error("Not implemented: getSession");
}

/**
 * Sliding expiration: reset the TTL to `ttlSeconds`.
 * Returns false (and must NOT create anything) if the session doesn't exist.
 */
export async function touchSession(
  redis: Redis,
  sessionId: string,
  ttlSeconds: number,
): Promise<boolean> {
  throw new Error("Not implemented: touchSession");
}

/** Delete the session (logout). Returns true if it existed. */
export async function destroySession(redis: Redis, sessionId: string): Promise<boolean> {
  throw new Error("Not implemented: destroySession");
}

void key;
void randomUUID;
