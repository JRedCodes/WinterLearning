import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { errorCode, ManualClock, put, start, stats, tempDir, type Running } from "./helpers.js";

let tmp: Awaited<ReturnType<typeof tempDir>>;
let clock: ManualClock;
let app: Running;

beforeEach(async () => {
  tmp = await tempDir();
  clock = new ManualClock();
  app = await start({ dataFile: join(tmp.dir, "kv.json"), clock });
});
afterEach(async () => {
  await app.kv.close();
  await tmp.cleanup();
});

describe("TTL via ?ttl=seconds", () => {
  it("PUT reports the absolute expiry time, and GET sends it as X-Expires-At", async () => {
    const res = await put(app.base, "session", "abc", { ttl: 60 });
    expect(res.status).toBe(201);
    const expected = new Date(clock.now() + 60_000).toISOString();
    expect(await res.json()).toEqual({ key: "session", expiresAt: expected });

    const got = await fetch(`${app.base}/kv/session`);
    expect(got.headers.get("x-expires-at")).toBe(expected);
  });

  it("keys without a TTL have no X-Expires-At header", async () => {
    await put(app.base, "forever", "v");
    expect((await fetch(`${app.base}/kv/forever`)).headers.get("x-expires-at")).toBeNull();
  });

  it("a key is readable until its TTL passes, then 404 (lazy expiry on read)", async () => {
    await put(app.base, "session", "abc", { ttl: 10 });
    clock.advance(9_999);
    expect((await fetch(`${app.base}/kv/session`)).status).toBe(200);
    clock.advance(1);
    const res = await fetch(`${app.base}/kv/session`);
    expect(res.status).toBe(404);
    expect(await errorCode(res)).toBe("KEY_NOT_FOUND");
  });

  it("expired keys count as misses and as expired, and leave the key count", async () => {
    await put(app.base, "a", "1", { ttl: 5 });
    await put(app.base, "b", "2");
    clock.advance(5_000);
    expect((await stats(app.base)).keys).toBe(1); // only live keys count, even before the sweep
    await fetch(`${app.base}/kv/a`);
    expect(await stats(app.base)).toMatchObject({ keys: 1, misses: 1, hits: 0, expired: 1 });
  });

  it("DELETE on an expired key is 404", async () => {
    await put(app.base, "a", "1", { ttl: 1 });
    clock.advance(1_000);
    expect((await fetch(`${app.base}/kv/a`, { method: "DELETE" })).status).toBe(404);
  });

  it("PUT over an expired key counts as a create (201)", async () => {
    await put(app.base, "a", "1", { ttl: 1 });
    clock.advance(2_000);
    expect((await put(app.base, "a", "2")).status).toBe(201);
  });

  it("PUT without ttl removes a previous TTL", async () => {
    await put(app.base, "a", "1", { ttl: 1 });
    await put(app.base, "a", "2");
    clock.advance(10_000);
    expect(await (await fetch(`${app.base}/kv/a`)).text()).toBe("2");
  });

  it("PUT with a new ttl resets the expiry", async () => {
    await put(app.base, "a", "1", { ttl: 10 });
    clock.advance(8_000);
    await put(app.base, "a", "1", { ttl: 10 });
    clock.advance(8_000);
    expect((await fetch(`${app.base}/kv/a`)).status).toBe(200);
  });

  it.each([["0"], ["-5"], ["1.5"], ["abc"], [""], ["31536001"]])("rejects ttl=%s with 400 INVALID_TTL", async (ttl) => {
    const res = await put(app.base, "a", "1", { ttl });
    expect(res.status).toBe(400);
    expect(await errorCode(res)).toBe("INVALID_TTL");
    expect((await fetch(`${app.base}/kv/a`)).status).toBe(404); // nothing stored
  });
});

describe("periodic sweep", () => {
  it("removes expired keys that nobody reads again", async () => {
    await app.kv.close();
    app = await start({ dataFile: join(tmp.dir, "sweep.json"), clock, sweepIntervalMs: 20 });

    await put(app.base, "a", "1", { ttl: 1 });
    await put(app.base, "b", "2", { ttl: 1 });
    await put(app.base, "c", "3");
    clock.advance(1_000);

    // No GETs on a or b: only the sweeper can account for them.
    await vi.waitFor(
      async () => {
        expect((await stats(app.base)).expired, "the sweeper should have removed 2 expired keys").toBe(2);
      },
      { timeout: 2_000, interval: 20 },
    );
    expect(await stats(app.base)).toMatchObject({ keys: 1, misses: 0 });
  });
});
