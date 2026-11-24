import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Redis } from "ioredis";
import { connectTestRedis, flushModuleKeys, sleep } from "./helpers/redis.js";
import { createSession, destroySession, getSession, touchSession } from "../src/exercises/sessions.js";

let redis: Redis;
beforeAll(async () => {
  redis = await connectTestRedis();
});
beforeEach(async () => {
  await flushModuleKeys(redis);
});
afterAll(async () => {
  await flushModuleKeys(redis);
  await redis.quit();
});

describe("exercise 2 · sessions (HASH + TTL)", () => {
  it("createSession returns a unique id and stores a hash", async () => {
    const a = await createSession(redis, { userId: "u1", role: "admin" }, 60, 1_700_000_000_000);
    const b = await createSession(redis, { userId: "u2", role: "member" }, 60);
    expect(a).toEqual(expect.any(String));
    expect(a).not.toBe(b);
    expect(await redis.type(`wl:17:session:${a}`)).toBe("hash");
    expect(await redis.hgetall(`wl:17:session:${a}`)).toEqual({
      userId: "u1",
      role: "admin",
      createdAt: "1700000000000",
    });
  });

  it("sets the TTL on the session key", async () => {
    const id = await createSession(redis, { userId: "u1", role: "admin" }, 120);
    const ttl = await redis.ttl(`wl:17:session:${id}`);
    expect(ttl, "TTL -1 means the key never expires").toBeGreaterThan(110);
    expect(ttl).toBeLessThanOrEqual(120);
  });

  it("getSession returns typed data (createdAt is a number)", async () => {
    const id = await createSession(redis, { userId: "u1", role: "admin" }, 60, 1_700_000_000_000);
    expect(await getSession(redis, id)).toEqual({
      userId: "u1",
      role: "admin",
      createdAt: 1_700_000_000_000,
    });
  });

  it("getSession returns null for an unknown id (not {})", async () => {
    expect(await getSession(redis, "nope")).toBeNull();
  });

  it("sessions disappear after their TTL", async () => {
    const id = await createSession(redis, { userId: "u1", role: "admin" }, 1);
    await sleep(1_100);
    expect(await getSession(redis, id)).toBeNull();
  });

  it("touchSession slides the expiry forward", async () => {
    const id = await createSession(redis, { userId: "u1", role: "admin" }, 30);
    expect(await touchSession(redis, id, 600)).toBe(true);
    expect(await redis.ttl(`wl:17:session:${id}`)).toBeGreaterThan(590);
  });

  it("touchSession on a missing session returns false and creates nothing", async () => {
    expect(await touchSession(redis, "ghost", 600)).toBe(false);
    expect(await redis.exists("wl:17:session:ghost")).toBe(0);
  });

  it("destroySession deletes the session", async () => {
    const id = await createSession(redis, { userId: "u1", role: "admin" }, 60);
    expect(await destroySession(redis, id)).toBe(true);
    expect(await getSession(redis, id)).toBeNull();
    expect(await destroySession(redis, id)).toBe(false);
  });
});
