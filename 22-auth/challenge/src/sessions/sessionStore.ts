import type { Redis } from "ioredis";

export interface Session {
  id: string;
  userId: string;
  /** Epoch milliseconds. */
  createdAt: number;
}

/** The auth service depends on this interface, not on Redis. */
export interface SessionStore {
  create(userId: string): Promise<Session>;
  /** Returns null for unknown/expired ids. Slides the expiry forward on every hit. */
  get(id: string): Promise<Session | null>;
  destroy(id: string): Promise<void>;
  /** "Log out everywhere": deletes every session of the user, returns how many were deleted. */
  destroyAllForUser(userId: string): Promise<number>;
}

export interface RedisSessionStoreOptions {
  /** e.g. "wl:22:" */
  prefix: string;
  ttlSeconds: number;
}

/**
 * TODO(2): Server-side sessions in Redis.
 *
 * Key layout (the tests look at these keys directly):
 *   <prefix>session:<id>          string, JSON {"userId": "...", "createdAt": 1700000000000}, EX ttlSeconds
 *   <prefix>user-sessions:<uid>   set of that user's session ids (for destroyAllForUser), EX ttlSeconds
 *
 * create(userId)
 *   - id: 32 random bytes encoded base64url (unguessable: 256 bits of entropy).
 *     NOT a uuid v4 from Math.random, NOT an incrementing number, NOT the user id.
 *   - write the session key with its TTL, add the id to the user's set and refresh that set's TTL.
 *     Use a MULTI (redis.multi()...exec()) so both writes happen together.
 * get(id)
 *   - missing key -> null
 *   - otherwise refresh the TTL (sliding idle timeout) and return the session
 * destroy(id)
 *   - delete the session key and remove the id from the owner's set (look the owner up first)
 * destroyAllForUser(userId)
 *   - read the set, delete every session key in it and the set itself, return how many
 *     session keys actually existed
 */
export class RedisSessionStore implements SessionStore {
  constructor(
    private readonly redis: Redis,
    private readonly opts: RedisSessionStoreOptions,
  ) {}

  private sessionKey(id: string): string {
    return `${this.opts.prefix}session:${id}`;
  }

  private userKey(userId: string): string {
    return `${this.opts.prefix}user-sessions:${userId}`;
  }

  async create(_userId: string): Promise<Session> {
    throw new Error("Not implemented: TODO(2) RedisSessionStore.create");
  }

  async get(_id: string): Promise<Session | null> {
    throw new Error("Not implemented: TODO(2) RedisSessionStore.get");
  }

  async destroy(_id: string): Promise<void> {
    throw new Error("Not implemented: TODO(2) RedisSessionStore.destroy");
  }

  async destroyAllForUser(_userId: string): Promise<number> {
    throw new Error("Not implemented: TODO(2) RedisSessionStore.destroyAllForUser");
  }
}
