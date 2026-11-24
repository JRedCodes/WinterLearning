import type { Redis } from "ioredis";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";
import { RedisSessionStore } from "../src/sessions/sessionStore.js";
import { connectTestRedis, flushPrefix } from "./helpers.js";

const config = loadConfig({ ...process.env, NODE_ENV: "test" });
const PREFIX = config.redisKeyPrefix; // wl:22:
const TTL = 600;

let redis: Redis;
let store: RedisSessionStore;

beforeAll(async () => {
  redis = await connectTestRedis(config.redisUrl);
  store = new RedisSessionStore(redis, { prefix: PREFIX, ttlSeconds: TTL });
});
beforeEach(async () => {
  await flushPrefix(redis, PREFIX);
});
afterAll(async () => {
  await flushPrefix(redis, PREFIX);
  await redis.quit();
});

describe("TODO(2) · RedisSessionStore", () => {
  it("create() returns an unguessable base64url id (>= 32 random bytes)", async () => {
    const s = await store.create("user-1");
    expect(s.userId).toBe("user-1");
    expect(s.id).toMatch(/^[A-Za-z0-9_-]{43,}$/);
    expect(typeof s.createdAt).toBe("number");
    const ids = new Set(await Promise.all(Array.from({ length: 20 }, async () => (await store.create("u")).id)));
    expect(ids.size).toBe(20);
  });

  it("stores the session at <prefix>session:<id> with the configured TTL", async () => {
    const s = await store.create("user-1");
    const key = `${PREFIX}session:${s.id}`;
    expect(await redis.exists(key), `expected key ${key}`).toBe(1);
    const ttl = await redis.ttl(key);
    expect(ttl).toBeGreaterThan(TTL - 5);
    expect(ttl).toBeLessThanOrEqual(TTL);
  });

  it("tracks the user's sessions in <prefix>user-sessions:<userId>, which also expires", async () => {
    const a = await store.create("user-1");
    const b = await store.create("user-1");
    const key = `${PREFIX}user-sessions:user-1`;
    expect((await redis.smembers(key)).sort()).toEqual([a.id, b.id].sort());
    expect(await redis.ttl(key)).toBeGreaterThan(0);
  });

  it("get() returns the session, and null for unknown ids", async () => {
    const s = await store.create("user-1");
    expect(await store.get(s.id)).toEqual(s);
    expect(await store.get("does-not-exist")).toBeNull();
  });

  it("get() slides the expiry forward (idle timeout)", async () => {
    const s = await store.create("user-1");
    const key = `${PREFIX}session:${s.id}`;
    await redis.expire(key, 5); // pretend most of the TTL has passed
    await store.get(s.id);
    expect(await redis.ttl(key)).toBeGreaterThan(TTL - 5);
  });

  it("destroy() removes the session and its entry in the user's set", async () => {
    const a = await store.create("user-1");
    const b = await store.create("user-1");
    await store.destroy(a.id);
    expect(await store.get(a.id)).toBeNull();
    expect(await store.get(b.id)).not.toBeNull();
    expect(await redis.smembers(`${PREFIX}user-sessions:user-1`)).toEqual([b.id]);
    await expect(store.destroy("unknown-id")).resolves.toBeUndefined();
  });

  it("destroyAllForUser() kills every session of that user only", async () => {
    const a = await store.create("user-1");
    const b = await store.create("user-1");
    const other = await store.create("user-2");
    expect(await store.destroyAllForUser("user-1")).toBe(2);
    expect(await store.get(a.id)).toBeNull();
    expect(await store.get(b.id)).toBeNull();
    expect(await store.get(other.id)).not.toBeNull();
    expect(await redis.exists(`${PREFIX}user-sessions:user-1`)).toBe(0);
    expect(await store.destroyAllForUser("nobody")).toBe(0);
  });
});
