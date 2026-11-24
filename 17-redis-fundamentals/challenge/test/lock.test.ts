import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Redis } from "ioredis";
import { connectTestRedis, flushModuleKeys, sleep } from "./helpers/redis.js";
import { LockNotAcquiredError, acquireLock, releaseLock, withLock } from "../src/exercises/lock.js";

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

describe("exercise 6 · distributed lock (SET NX PX + Lua)", () => {
  it("acquireLock returns a token, and a second acquire fails while held", async () => {
    const token = await acquireLock(redis, "report", 5_000);
    expect(token).toEqual(expect.any(String));
    expect(await redis.get("wl:17:lock:report")).toBe(token);
    expect(await acquireLock(redis, "report", 5_000)).toBeNull();
  });

  it("sets a millisecond expiry on the lock", async () => {
    await acquireLock(redis, "report", 5_000);
    const pttl = await redis.pttl("wl:17:lock:report");
    expect(pttl, "a lock without TTL lives forever if its holder crashes").toBeGreaterThan(4_000);
    expect(pttl).toBeLessThanOrEqual(5_000);
  });

  it("exactly one of 20 concurrent acquirers wins", async () => {
    const tokens = await Promise.all(Array.from({ length: 20 }, () => acquireLock(redis, "job", 5_000)));
    expect(tokens.filter((t) => t !== null)).toHaveLength(1);
  });

  it("the lock expires on its own", async () => {
    await acquireLock(redis, "report", 100);
    await sleep(200);
    expect(await acquireLock(redis, "report", 5_000)).not.toBeNull();
  });

  it("releaseLock frees the lock for the owner", async () => {
    const token = (await acquireLock(redis, "report", 5_000))!;
    expect(await releaseLock(redis, "report", token)).toBe(true);
    expect(await acquireLock(redis, "report", 5_000)).not.toBeNull();
  });

  it("releaseLock with the wrong token does nothing", async () => {
    const token = await acquireLock(redis, "report", 5_000);
    expect(await releaseLock(redis, "report", "not-my-token")).toBe(false);
    expect(await redis.get("wl:17:lock:report")).toBe(token);
  });

  it("a holder whose lock expired cannot delete the NEW holder's lock", async () => {
    const slowWorker = (await acquireLock(redis, "report", 100))!;
    await sleep(200); // slow worker's lock expires...
    const fastWorker = await acquireLock(redis, "report", 5_000); // ...and someone else takes it
    expect(fastWorker).not.toBeNull();
    expect(await releaseLock(redis, "report", slowWorker)).toBe(false);
    expect(await redis.get("wl:17:lock:report")).toBe(fastWorker);
  });

  it("withLock runs fn, returns its result and releases the lock", async () => {
    const result = await withLock(redis, "report", 5_000, async () => {
      expect(await redis.exists("wl:17:lock:report"), "lock should be held while fn runs").toBe(1);
      return 42;
    });
    expect(result).toBe(42);
    expect(await redis.exists("wl:17:lock:report")).toBe(0);
  });

  it("withLock releases the lock even when fn throws", async () => {
    await expect(
      withLock(redis, "report", 5_000, async () => {
        throw new Error("job failed");
      }),
    ).rejects.toThrow("job failed");
    expect(await redis.exists("wl:17:lock:report")).toBe(0);
  });

  it("withLock throws LockNotAcquiredError without calling fn when busy", async () => {
    await acquireLock(redis, "report", 5_000);
    let called = false;
    await expect(
      withLock(redis, "report", 5_000, async () => {
        called = true;
      }),
    ).rejects.toBeInstanceOf(LockNotAcquiredError);
    expect(called).toBe(false);
  });
});
