import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Redis } from "ioredis";
import { connectTestRedis, flushModuleKeys } from "./helpers/redis.js";
import { appendEvent, readEvents } from "../src/exercises/eventStream.js";

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

const ID = /^\d+-\d+$/;

describe("exercise 8 · event stream (STREAM)", () => {
  it("appendEvent returns an auto-generated, increasing id", async () => {
    const a = await appendEvent(redis, "orders", { type: "created", orderId: "1" });
    const b = await appendEvent(redis, "orders", { type: "paid", orderId: "1" });
    expect(a).toMatch(ID);
    expect(b).toMatch(ID);
    expect(await redis.type("wl:17:stream:orders")).toBe("stream");
    expect(await redis.xlen("wl:17:stream:orders")).toBe(2);
    const [aMs, aSeq] = a.split("-").map(Number);
    const [bMs, bSeq] = b.split("-").map(Number);
    expect(bMs! > aMs! || (bMs === aMs && bSeq! > aSeq!)).toBe(true);
  });

  it("readEvents returns entries oldest first with fields as an object", async () => {
    const a = await appendEvent(redis, "orders", { type: "created", orderId: "1" });
    const b = await appendEvent(redis, "orders", { type: "paid", orderId: "1" });
    expect(await readEvents(redis, "orders")).toEqual([
      { id: a, fields: { type: "created", orderId: "1" } },
      { id: b, fields: { type: "paid", orderId: "1" } },
    ]);
  });

  it("readEvents(afterId) returns only entries strictly after afterId", async () => {
    await appendEvent(redis, "orders", { n: "1" });
    const second = await appendEvent(redis, "orders", { n: "2" });
    const third = await appendEvent(redis, "orders", { n: "3" });
    const after = await readEvents(redis, "orders", second);
    expect(after).toEqual([{ id: third, fields: { n: "3" } }]);
    expect(await readEvents(redis, "orders", third)).toEqual([]);
  });

  it("a consumer can page through the stream with count + last id", async () => {
    for (let i = 1; i <= 7; i++) await appendEvent(redis, "orders", { n: String(i) });
    const seen: string[] = [];
    let cursor = "0";
    for (;;) {
      const page = await readEvents(redis, "orders", cursor, 3);
      if (page.length === 0) break;
      expect(page.length).toBeLessThanOrEqual(3);
      seen.push(...page.map((e) => e.fields.n!));
      cursor = page.at(-1)!.id;
    }
    expect(seen).toEqual(["1", "2", "3", "4", "5", "6", "7"]);
  });

  it("readEvents on a missing stream returns []", async () => {
    expect(await readEvents(redis, "nothing-here")).toEqual([]);
  });

  it("appendEvent keeps the stream bounded by maxLen", async () => {
    const pipeline: Promise<string>[] = [];
    for (let i = 0; i < 400; i++) pipeline.push(appendEvent(redis, "clicks", { i: String(i) }, 10));
    await Promise.all(pipeline);
    const len = await redis.xlen("wl:17:stream:clicks");
    expect(len, "stream was never trimmed: pass MAXLEN to XADD").toBeLessThan(400);
    expect(len).toBeGreaterThanOrEqual(10);
  });
});
