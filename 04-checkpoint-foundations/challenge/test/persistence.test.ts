import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createKvServer } from "../src/index.js";
import { ManualClock, put, start, stats, tempDir, type Running } from "./helpers.js";

let tmp: Awaited<ReturnType<typeof tempDir>>;
let dataFile: string;
let running: Running[] = [];

async function boot(options: Partial<Parameters<typeof start>[0]> = {}): Promise<Running> {
  const app = await start({ dataFile, ...options });
  running.push(app);
  return app;
}

beforeEach(async () => {
  tmp = await tempDir();
  dataFile = join(tmp.dir, "kv.json");
});
afterEach(async () => {
  await Promise.all(running.map((app) => app.kv.close()));
  running = [];
  await tmp.cleanup();
});

describe("persistence", () => {
  it("starts empty when the data file doesn't exist", async () => {
    const app = await boot();
    expect((await stats(app.base)).keys).toBe(0);
  });

  it("data survives a restart (close flushes, the next start loads)", async () => {
    const first = await boot();
    await put(first.base, "a", "alpha", { type: "text/plain" });
    await put(first.base, "b", '{"n":1}', { type: "application/json" });
    await put(first.base, "c", "gone");
    await fetch(`${first.base}/kv/c`, { method: "DELETE" });
    await first.kv.close();

    const second = await boot();
    const a = await fetch(`${second.base}/kv/a`);
    expect(await a.text()).toBe("alpha");
    expect(a.headers.get("content-type")).toBe("text/plain");
    expect(await (await fetch(`${second.base}/kv/b`)).json()).toEqual({ n: 1 });
    expect((await fetch(`${second.base}/kv/c`)).status).toBe(404);
    expect((await stats(second.base)).keys).toBe(2);
  });

  it("creates the data file's directory if needed", async () => {
    dataFile = join(tmp.dir, "nested", "deeper", "kv.json");
    const app = await boot();
    await put(app.base, "a", "1");
    await app.kv.close();
    expect(JSON.parse(await readFile(dataFile, "utf8"))).toBeTruthy();
  });

  it("close() flushes pending changes even if the debounce hasn't fired yet", async () => {
    const app = await boot({ flushDebounceMs: 60_000 });
    await put(app.base, "a", "1");
    await app.kv.close();

    const reopened = await boot();
    expect(await (await fetch(`${reopened.base}/kv/a`)).text()).toBe("1");
  });

  it("writes are debounced: a burst of changes produces few flushes", async () => {
    const app = await boot({ flushDebounceMs: 150 });
    for (let i = 0; i < 10; i++) await put(app.base, `k${i}`, String(i));
    expect((await stats(app.base)).flushes, "nothing should be written in the middle of a burst").toBe(0);

    await vi.waitFor(
      async () => {
        const text = await readFile(dataFile, "utf8").catch(() => "");
        expect(text).toContain("k9");
      },
      { timeout: 3_000, interval: 25 },
    );
    const { flushes } = await stats(app.base);
    expect(flushes).toBeGreaterThanOrEqual(1);
    expect(flushes, "10 rapid PUTs should be coalesced into 1-2 writes").toBeLessThanOrEqual(2);
  });

  it("the data file is valid JSON and no temp files are left behind", async () => {
    const app = await boot({ flushDebounceMs: 5 });
    for (let i = 0; i < 20; i++) await put(app.base, `k${i}`, "x".repeat(100));
    await app.kv.close();

    const text = await readFile(dataFile, "utf8");
    expect(() => JSON.parse(text), "data file must be complete, valid JSON").not.toThrow();
    expect(await readdir(tmp.dir)).toEqual(["kv.json"]);
  });

  it("does not resurrect keys whose TTL passed while the server was down", async () => {
    const clock = new ManualClock();
    const first = await boot({ clock });
    await put(first.base, "short", "1", { ttl: 10 });
    await put(first.base, "long", "2", { ttl: 3600 });
    await first.kv.close();

    clock.advance(60_000);
    const second = await boot({ clock });
    expect((await fetch(`${second.base}/kv/short`)).status).toBe(404);
    const long = await fetch(`${second.base}/kv/long`);
    expect(long.status).toBe(200);
    // the absolute expiry time survived the restart
    expect(long.headers.get("x-expires-at")).toBe(new Date(Date.UTC(2026, 0, 1) + 3_600_000).toISOString());
  });

  it("refuses to start on a corrupt data file instead of silently discarding it", async () => {
    await writeFile(dataFile, '{"version":1,"entries":{"a":', "utf8");
    await expect(createKvServer({ dataFile })).rejects.toThrow();
    // and the file is left untouched for a human to inspect
    expect(await readFile(dataFile, "utf8")).toBe('{"version":1,"entries":{"a":');
  });

  it("close() can be called twice", async () => {
    const app = await boot();
    await app.kv.close();
    await expect(app.kv.close()).resolves.toBeUndefined();
  });

  it("close() stops accepting connections", async () => {
    const app = await boot();
    await app.kv.close();
    await expect(fetch(`${app.base}/stats`)).rejects.toThrow();
  });
});
