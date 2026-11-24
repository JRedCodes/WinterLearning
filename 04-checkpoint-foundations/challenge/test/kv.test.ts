import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { errorCode, put, start, stats, tempDir, type Running } from "./helpers.js";

let tmp: Awaited<ReturnType<typeof tempDir>>;
let app: Running;

beforeEach(async () => {
  tmp = await tempDir();
  app = await start({ dataFile: join(tmp.dir, "kv.json") });
});
afterEach(async () => {
  await app.kv.close();
  await tmp.cleanup();
});

describe("PUT / GET / DELETE /kv/:key", () => {
  it("PUT creates a key (201) and GET returns the exact value with its content type", async () => {
    const res = await put(app.base, "greeting", "hello, wörld", { type: "text/plain; charset=utf-8" });
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ key: "greeting", expiresAt: null });

    const got = await fetch(`${app.base}/kv/greeting`);
    expect(got.status).toBe(200);
    expect(got.headers.get("content-type")).toBe("text/plain; charset=utf-8");
    expect(await got.text()).toBe("hello, wörld");
  });

  it("PUT on an existing key replaces it and returns 200", async () => {
    await put(app.base, "k", "one");
    const res = await put(app.base, "k", "two");
    expect(res.status).toBe(200);
    expect(await (await fetch(`${app.base}/kv/k`)).text()).toBe("two");
  });

  it("stores JSON values verbatim", async () => {
    const value = JSON.stringify({ nested: { list: [1, 2, 3] } });
    await put(app.base, "cfg", value, { type: "application/json" });
    const got = await fetch(`${app.base}/kv/cfg`);
    expect(got.headers.get("content-type")).toBe("application/json");
    expect(await got.json()).toEqual({ nested: { list: [1, 2, 3] } });
  });

  it("defaults the content type to application/octet-stream", async () => {
    await fetch(`${app.base}/kv/raw`, { method: "PUT", body: new TextEncoder().encode("bytes") });
    expect((await fetch(`${app.base}/kv/raw`)).headers.get("content-type")).toBe("application/octet-stream");
  });

  it("accepts an empty value", async () => {
    expect((await put(app.base, "empty", "")).status).toBe(201);
    const got = await fetch(`${app.base}/kv/empty`);
    expect(got.status).toBe(200);
    expect(await got.text()).toBe("");
  });

  it("GET on a missing key is 404 KEY_NOT_FOUND", async () => {
    const res = await fetch(`${app.base}/kv/nope`);
    expect(res.status).toBe(404);
    expect(await errorCode(res)).toBe("KEY_NOT_FOUND");
  });

  it("DELETE removes a key (204, empty body) and a second DELETE is 404", async () => {
    await put(app.base, "k", "v");
    const del = await fetch(`${app.base}/kv/k`, { method: "DELETE" });
    expect(del.status).toBe(204);
    expect(await del.text()).toBe("");
    expect((await fetch(`${app.base}/kv/k`)).status).toBe(404);
    const again = await fetch(`${app.base}/kv/k`, { method: "DELETE" });
    expect(again.status).toBe(404);
    expect(await errorCode(again)).toBe("KEY_NOT_FOUND");
  });

  it("allows letters, digits and . _ : - in keys", async () => {
    expect((await put(app.base, "user:42.session_v-1", "x")).status).toBe(201);
    expect((await fetch(`${app.base}/kv/user:42.session_v-1`)).status).toBe(200);
  });

  it.each([
    ["a space (encoded)", "has%20space"],
    ["a non-ASCII character", "caf%C3%A9"],
    ["more than 200 characters", "k".repeat(201)],
    ["malformed percent-encoding", "%E0%A4%A"],
  ])("rejects keys with %s: 400 INVALID_KEY", async (_label, key) => {
    const res = await put(app.base, key, "v");
    expect(res.status).toBe(400);
    expect(await errorCode(res)).toBe("INVALID_KEY");
  });

  it("rejects values over maxValueBytes with 413 and keeps the old value", async () => {
    await app.kv.close();
    app = await start({ dataFile: join(tmp.dir, "kv2.json"), maxValueBytes: 16 });
    await put(app.base, "k", "small");
    const res = await put(app.base, "k", "x".repeat(17));
    expect(res.status).toBe(413);
    expect(await (await fetch(`${app.base}/kv/k`)).text()).toBe("small");
  });
});

describe("routing", () => {
  it("unknown paths are 404 ROUTE_NOT_FOUND", async () => {
    for (const path of ["/", "/kv", "/kv/", "/kv/a/b", "/other"]) {
      const res = await fetch(`${app.base}${path}`);
      expect(res.status, path).toBe(404);
      expect(await errorCode(res), path).toBe("ROUTE_NOT_FOUND");
    }
  });

  it("wrong methods are 405 with an Allow header", async () => {
    const res = await fetch(`${app.base}/kv/k`, { method: "POST", body: "x" });
    expect(res.status).toBe(405);
    expect(await errorCode(res)).toBe("METHOD_NOT_ALLOWED");
    const allow = (res.headers.get("allow") ?? "").split(",").map((m) => m.trim()).sort();
    expect(allow).toEqual(["DELETE", "GET", "PUT"]);

    const statsPost = await fetch(`${app.base}/stats`, { method: "POST" });
    expect(statsPost.status).toBe(405);
    expect(statsPost.headers.get("allow")).toMatch(/GET/);
  });

  it("errors are JSON", async () => {
    const res = await fetch(`${app.base}/kv/missing`);
    expect(res.headers.get("content-type")).toMatch(/^application\/json/);
  });
});

describe("GET /stats", () => {
  it("starts at zero", async () => {
    expect(await stats(app.base)).toEqual({
      keys: 0,
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0,
      expired: 0,
      flushes: 0,
    });
  });

  it("counts keys, hits, misses, sets and deletes", async () => {
    await put(app.base, "a", "1");
    await put(app.base, "b", "2");
    await put(app.base, "a", "3");
    await fetch(`${app.base}/kv/a`);
    await fetch(`${app.base}/kv/a`);
    await fetch(`${app.base}/kv/zzz`);
    await fetch(`${app.base}/kv/b`, { method: "DELETE" });
    await fetch(`${app.base}/kv/b`, { method: "DELETE" }); // 404: not counted

    expect(await stats(app.base)).toMatchObject({ keys: 1, hits: 2, misses: 1, sets: 3, deletes: 1, expired: 0 });
  });
});
