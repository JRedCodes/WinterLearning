import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { json, readError, startServer, type TestServer } from "./helpers.js";

interface Bookmark {
  id: string;
  url: string;
  title: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

let srv: TestServer;
beforeEach(async () => {
  srv = await startServer();
});
afterEach(async () => {
  await srv.close();
});

async function create(body: unknown): Promise<Bookmark> {
  const res = await fetch(`${srv.base}/bookmarks`, json(body));
  expect(res.status, `POST /bookmarks failed with ${res.status}: ${await res.clone().text()}`).toBe(201);
  return ((await res.json()) as { data: Bookmark }).data;
}

describe("GET /health", () => {
  it("returns 200 { status: ok } as JSON", async () => {
    const res = await fetch(`${srv.base}/health`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/^application\/json/);
    expect(await res.json()).toEqual({ status: "ok" });
  });
});

describe("POST /bookmarks (TODO 4)", () => {
  it("creates a bookmark: 201, Location header, JSON body", async () => {
    const res = await fetch(
      `${srv.base}/bookmarks`,
      json({ url: "https://nodejs.org/api/http.html", title: "  Node http docs ", tags: ["Node", "docs", "node"] }),
    );
    expect(res.status).toBe(201);
    expect(res.headers.get("content-type")).toMatch(/^application\/json/);
    const { data } = (await res.json()) as { data: Bookmark };
    expect(data).toMatchObject({
      url: "https://nodejs.org/api/http.html",
      title: "Node http docs",
      tags: ["node", "docs"], // trimmed, lowercased, de-duplicated
    });
    expect(data.id).toEqual(expect.any(String));
    expect(Date.parse(data.createdAt)).not.toBeNaN();
    expect(res.headers.get("location")).toBe(`/bookmarks/${data.id}`);
  });

  it("defaults title to the url and tags to []", async () => {
    const data = await create({ url: "https://example.com/" });
    expect(data.title).toBe("https://example.com/");
    expect(data.tags).toEqual([]);
  });

  it("accepts a charset parameter on the content type", async () => {
    const res = await fetch(`${srv.base}/bookmarks`, {
      method: "POST",
      headers: { "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify({ url: "https://example.com" }),
    });
    expect(res.status).toBe(201);
  });

  it.each([
    ["a non-object body", [1, 2]],
    ["missing url", { title: "x" }],
    ["non-string url", { url: 42 }],
    ["relative url", { url: "/just/a/path" }],
    ["non-http url", { url: "ftp://example.com/file" }],
    ["javascript: url", { url: "javascript:alert(1)" }],
    ["url over 2048 chars", { url: `https://example.com/${"a".repeat(2048)}` }],
    ["blank title", { url: "https://example.com", title: "   " }],
    ["non-string title", { url: "https://example.com", title: 5 }],
    ["title over 200 chars", { url: "https://example.com", title: "t".repeat(201) }],
    ["tags not an array", { url: "https://example.com", tags: "node" }],
    ["non-string tag", { url: "https://example.com", tags: ["ok", 1] }],
    ["empty tag", { url: "https://example.com", tags: [" "] }],
    ["more than 10 tags", { url: "https://example.com", tags: Array.from({ length: 11 }, (_, i) => `t${i}`) }],
  ])("rejects %s with 400 VALIDATION_ERROR", async (_label, body) => {
    const res = await fetch(`${srv.base}/bookmarks`, json(body));
    expect(res.status).toBe(400);
    expect((await readError(res)).error.code).toBe("VALIDATION_ERROR");
  });
});

describe("GET /bookmarks (TODO 4)", () => {
  it("lists bookmarks in creation order", async () => {
    await create({ url: "https://a.example" });
    await create({ url: "https://b.example" });
    const res = await fetch(`${srv.base}/bookmarks`);
    expect(res.status).toBe(200);
    const { data } = (await res.json()) as { data: Bookmark[] };
    expect(data.map((b) => b.url)).toEqual(["https://a.example", "https://b.example"]);
  });

  it("filters by ?tag= (case-insensitive)", async () => {
    await create({ url: "https://a.example", tags: ["node"] });
    await create({ url: "https://b.example", tags: ["postgres"] });
    await create({ url: "https://c.example", tags: ["node", "http"] });
    const res = await fetch(`${srv.base}/bookmarks?tag=NODE`);
    const { data } = (await res.json()) as { data: Bookmark[] };
    expect(data.map((b) => b.url)).toEqual(["https://a.example", "https://c.example"]);
  });

  it("returns an empty list, not 404, when nothing matches", async () => {
    const res = await fetch(`${srv.base}/bookmarks?tag=nothing`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: [] });
  });
});

describe("GET /bookmarks/:id (TODO 4)", () => {
  it("returns the bookmark", async () => {
    const created = await create({ url: "https://example.com" });
    const res = await fetch(`${srv.base}/bookmarks/${created.id}`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: created });
  });

  it("returns 404 NOT_FOUND for an unknown id", async () => {
    const res = await fetch(`${srv.base}/bookmarks/does-not-exist`);
    expect(res.status).toBe(404);
    expect((await readError(res)).error.code).toBe("NOT_FOUND");
  });
});

describe("PUT /bookmarks/:id (TODO 4)", () => {
  it("replaces the bookmark and returns it", async () => {
    const created = await create({ url: "https://old.example", title: "old", tags: ["a"] });
    const res = await fetch(`${srv.base}/bookmarks/${created.id}`, {
      ...json({ url: "https://new.example" }),
      method: "PUT",
    });
    expect(res.status).toBe(200);
    const { data } = (await res.json()) as { data: Bookmark };
    // PUT replaces the whole resource: omitted fields go back to their defaults.
    expect(data).toMatchObject({ id: created.id, url: "https://new.example", title: "https://new.example", tags: [] });
    expect(data.createdAt).toBe(created.createdAt);
  });

  it("is idempotent: the same PUT twice leaves the same state", async () => {
    const created = await create({ url: "https://old.example" });
    const put = () =>
      fetch(`${srv.base}/bookmarks/${created.id}`, { ...json({ url: "https://x.example", title: "X" }), method: "PUT" });
    await put();
    await put();
    const { data } = (await (await fetch(`${srv.base}/bookmarks`)).json()) as { data: Bookmark[] };
    expect(data).toHaveLength(1);
    expect(data[0]).toMatchObject({ url: "https://x.example", title: "X" });
  });

  it("returns 404 for an unknown id", async () => {
    const res = await fetch(`${srv.base}/bookmarks/nope`, { ...json({ url: "https://x.example" }), method: "PUT" });
    expect(res.status).toBe(404);
    expect((await readError(res)).error.code).toBe("NOT_FOUND");
  });

  it("validates the body like POST", async () => {
    const created = await create({ url: "https://old.example" });
    const res = await fetch(`${srv.base}/bookmarks/${created.id}`, { ...json({ url: "nope" }), method: "PUT" });
    expect(res.status).toBe(400);
  });
});

describe("DELETE /bookmarks/:id (TODO 4)", () => {
  it("returns 204 with no body, then 404 on the second delete", async () => {
    const created = await create({ url: "https://example.com" });
    const first = await fetch(`${srv.base}/bookmarks/${created.id}`, { method: "DELETE" });
    expect(first.status).toBe(204);
    expect(await first.text()).toBe("");

    const again = await fetch(`${srv.base}/bookmarks/${created.id}`, { method: "DELETE" });
    expect(again.status).toBe(404);

    const get = await fetch(`${srv.base}/bookmarks/${created.id}`);
    expect(get.status).toBe(404);
  });
});

describe("conditional GET with ETag (TODO 5)", () => {
  it("GET /bookmarks/:id sends a quoted ETag and Cache-Control: no-cache", async () => {
    const created = await create({ url: "https://example.com" });
    const res = await fetch(`${srv.base}/bookmarks/${created.id}`);
    expect(res.headers.get("etag")).toMatch(/^"[^"]+"$/);
    expect(res.headers.get("cache-control")).toBe("no-cache");
  });

  it("returns 304 with no body when If-None-Match matches", async () => {
    const created = await create({ url: "https://example.com" });
    const first = await fetch(`${srv.base}/bookmarks/${created.id}`);
    const etag = first.headers.get("etag") ?? "";

    const second = await fetch(`${srv.base}/bookmarks/${created.id}`, { headers: { "if-none-match": etag } });
    expect(second.status).toBe(304);
    expect(second.headers.get("etag")).toBe(etag);
    expect(await second.text()).toBe("");
  });

  it("returns 200 with a new ETag after the bookmark changes", async () => {
    const created = await create({ url: "https://example.com" });
    const etag = (await fetch(`${srv.base}/bookmarks/${created.id}`)).headers.get("etag") ?? "";

    await fetch(`${srv.base}/bookmarks/${created.id}`, { ...json({ url: "https://changed.example" }), method: "PUT" });

    const res = await fetch(`${srv.base}/bookmarks/${created.id}`, { headers: { "if-none-match": etag } });
    expect(res.status).toBe(200);
    expect(res.headers.get("etag")).not.toBe(etag);
    expect(((await res.json()) as { data: Bookmark }).data.url).toBe("https://changed.example");
  });

  it("returns 200 when If-None-Match is a different tag", async () => {
    const created = await create({ url: "https://example.com" });
    const res = await fetch(`${srv.base}/bookmarks/${created.id}`, { headers: { "if-none-match": '"stale"' } });
    expect(res.status).toBe(200);
  });
});

describe("HEAD (TODO 1 + 5)", () => {
  it("HEAD /bookmarks/:id returns GET's status and headers, without a body", async () => {
    const created = await create({ url: "https://example.com" });
    const get = await fetch(`${srv.base}/bookmarks/${created.id}`);
    const getBody = await get.text();

    const head = await fetch(`${srv.base}/bookmarks/${created.id}`, { method: "HEAD" });
    expect(head.status).toBe(200);
    expect(head.headers.get("etag")).toBe(get.headers.get("etag"));
    expect(head.headers.get("content-type")).toMatch(/^application\/json/);
    expect(head.headers.get("content-length")).toBe(String(Buffer.byteLength(getBody)));
    expect(await head.text()).toBe("");
  });

  it("HEAD /bookmarks works and HEAD on a missing id is 404", async () => {
    expect((await fetch(`${srv.base}/bookmarks`, { method: "HEAD" })).status).toBe(200);
    expect((await fetch(`${srv.base}/bookmarks/missing`, { method: "HEAD" })).status).toBe(404);
  });
});
