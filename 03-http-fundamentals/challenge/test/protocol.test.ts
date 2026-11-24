import { request } from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import { InMemoryBookmarkStore } from "../src/store.js";
import type { BookmarkStore } from "../src/types.js";
import { json, readError, startServer, type TestServer } from "./helpers.js";

let srv: TestServer | undefined;
afterEach(async () => {
  await srv?.close();
  srv = undefined;
  vi.restoreAllMocks();
});

describe("routing errors (TODO 1 + 3)", () => {
  it("unknown path → 404 ROUTE_NOT_FOUND as JSON", async () => {
    srv = await startServer();
    const res = await fetch(`${srv.base}/nope`);
    expect(res.status).toBe(404);
    expect((await readError(res)).error.code).toBe("ROUTE_NOT_FOUND");
  });

  it("known path, wrong method → 405 with an Allow header", async () => {
    srv = await startServer();
    const res = await fetch(`${srv.base}/bookmarks`, { method: "PATCH" });
    expect(res.status).toBe(405);
    expect((await readError(res)).error.code).toBe("METHOD_NOT_ALLOWED");
    const allow = (res.headers.get("allow") ?? "").split(",").map((m) => m.trim()).sort();
    expect(allow).toEqual(["GET", "HEAD", "POST"]);
  });

  it("405 on an item route lists the item's methods", async () => {
    srv = await startServer();
    const res = await fetch(`${srv.base}/bookmarks/123`, { method: "POST" });
    expect(res.status).toBe(405);
    const allow = (res.headers.get("allow") ?? "").split(",").map((m) => m.trim()).sort();
    expect(allow).toEqual(["DELETE", "GET", "HEAD", "PUT"]);
  });

  it("query strings don't affect routing", async () => {
    srv = await startServer();
    expect((await fetch(`${srv.base}/health?verbose=1`)).status).toBe(200);
  });
});

describe("request bodies (TODO 3)", () => {
  it("wrong Content-Type → 415 UNSUPPORTED_MEDIA_TYPE", async () => {
    srv = await startServer();
    const res = await fetch(`${srv.base}/bookmarks`, {
      method: "POST",
      headers: { "content-type": "text/plain" },
      body: JSON.stringify({ url: "https://example.com" }),
    });
    expect(res.status).toBe(415);
    expect((await readError(res)).error.code).toBe("UNSUPPORTED_MEDIA_TYPE");
  });

  it("missing Content-Type → 415", async () => {
    srv = await startServer();
    // A Uint8Array body makes fetch send no Content-Type at all.
    const res = await fetch(`${srv.base}/bookmarks`, {
      method: "POST",
      body: new TextEncoder().encode('{"url":"https://example.com"}'),
    });
    expect(res.status).toBe(415);
  });

  it("malformed JSON → 400 INVALID_JSON", async () => {
    srv = await startServer();
    const res = await fetch(`${srv.base}/bookmarks`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: '{"url": ',
    });
    expect(res.status).toBe(400);
    expect((await readError(res)).error.code).toBe("INVALID_JSON");
  });

  it("empty body → 400 INVALID_JSON", async () => {
    srv = await startServer();
    const res = await fetch(`${srv.base}/bookmarks`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "",
    });
    expect(res.status).toBe(400);
    expect((await readError(res)).error.code).toBe("INVALID_JSON");
  });

  it("body over the default 10 KiB limit → 413 PAYLOAD_TOO_LARGE", async () => {
    srv = await startServer();
    const res = await fetch(
      `${srv.base}/bookmarks`,
      json({ url: "https://example.com", title: "x", padding: "p".repeat(11 * 1024) }),
    );
    expect(res.status).toBe(413);
    expect((await readError(res)).error.code).toBe("PAYLOAD_TOO_LARGE");
  });

  it("respects a custom maxBodyBytes", async () => {
    srv = await startServer({ maxBodyBytes: 64 });
    const small = await fetch(`${srv.base}/bookmarks`, json({ url: "https://e.x" }));
    expect(small.status).toBe(201);
    const big = await fetch(`${srv.base}/bookmarks`, json({ url: "https://example.com", title: "t".repeat(80) }));
    expect(big.status).toBe(413);
  });

  it("enforces the limit on chunked bodies that have no Content-Length", async () => {
    srv = await startServer({ maxBodyBytes: 100 });
    const { base } = srv;
    // node:http gives us full control: no Content-Length, so it uses chunked encoding.
    const status = await new Promise<number>((resolve, reject) => {
      const req = request(
        `${base}/bookmarks`,
        { method: "POST", headers: { "content-type": "application/json", "transfer-encoding": "chunked" } },
        (res) => {
          res.resume();
          resolve(res.statusCode ?? 0);
        },
      );
      req.on("error", reject);
      req.write('{"url":"https://example.com","pad":"');
      req.write("x".repeat(200));
      req.end('"}');
    });
    expect(status).toBe(413);
  });
});

describe("unexpected errors (TODO 3)", () => {
  it("→ 500 INTERNAL_ERROR with a generic message, details only in the server log", async () => {
    const store: BookmarkStore = new InMemoryBookmarkStore();
    vi.spyOn(store, "list").mockRejectedValue(new Error("connection to db-primary-7 refused"));
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    srv = await startServer({ store });

    const res = await fetch(`${srv.base}/bookmarks`);
    expect(res.status).toBe(500);
    const body = await readError(res);
    expect(body.error.code).toBe("INTERNAL_ERROR");
    expect(JSON.stringify(body)).not.toMatch(/db-primary/);
    expect(logged).toHaveBeenCalled();
  });

  it("keeps serving requests after an unexpected error", async () => {
    const store = new InMemoryBookmarkStore();
    vi.spyOn(store, "list").mockRejectedValueOnce(new Error("boom"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    srv = await startServer({ store });
    expect((await fetch(`${srv.base}/bookmarks`)).status).toBe(500);
    expect((await fetch(`${srv.base}/bookmarks`)).status).toBe(200);
  });
});
