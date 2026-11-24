import { afterEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { NoteStore } from "../src/lib/noteStore.js";

describe("request ids (TODO 1)", () => {
  it("generates an X-Request-Id for every response", async () => {
    const app = createApp();
    const a = await request(app).get("/health");
    const b = await request(app).get("/health");
    expect(a.headers["x-request-id"]).toMatch(/^[A-Za-z0-9_-]{1,128}$/);
    expect(a.headers["x-request-id"]).not.toBe(b.headers["x-request-id"]);
  });

  it("reuses a valid incoming X-Request-Id", async () => {
    const res = await request(createApp()).get("/health").set("X-Request-Id", "abc-123_XYZ");
    expect(res.headers["x-request-id"]).toBe("abc-123_XYZ");
  });

  it("ignores an invalid incoming X-Request-Id", async () => {
    const res = await request(createApp()).get("/health").set("X-Request-Id", "bad id with spaces!");
    expect(res.headers["x-request-id"]).not.toBe("bad id with spaces!");
    expect(res.headers["x-request-id"]).toMatch(/^[A-Za-z0-9_-]{1,128}$/);
  });

  it("includes the request id in error bodies", async () => {
    const res = await request(createApp()).get("/notes/999").set("X-Request-Id", "trace-me");
    expect(res.body.error?.requestId).toBe("trace-me");
  });
});

describe("unknown routes (TODO 5)", () => {
  it("returns a JSON 404 with ROUTE_NOT_FOUND", async () => {
    const res = await request(createApp()).get("/definitely-not-here");
    expect(res.status).toBe(404);
    expect(res.headers["content-type"]).toMatch(/application\/json/);
    expect(res.body.error).toMatchObject({
      code: "ROUTE_NOT_FOUND",
      message: "Cannot GET /definitely-not-here",
    });
  });
});

describe("error handler (TODO 6)", () => {
  afterEach(() => vi.restoreAllMocks());

  it("turns malformed JSON into 400 INVALID_JSON", async () => {
    const res = await request(createApp())
      .post("/notes")
      .set("Content-Type", "application/json")
      .send('{"title": "oops"');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("INVALID_JSON");
  });

  it("turns unexpected errors into a generic 500 without leaking details", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const store = new NoteStore();
    vi.spyOn(store, "list").mockRejectedValue(new Error("connection to db-primary-7 refused"));
    const res = await request(createApp({ store })).get("/notes");
    expect(res.status).toBe(500);
    expect(res.body.error).toMatchObject({ code: "INTERNAL_ERROR", message: "Something went wrong" });
    expect(JSON.stringify(res.body)).not.toContain("db-primary-7");
  });

  it("logs unexpected errors on the server", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const store = new NoteStore();
    vi.spyOn(store, "list").mockRejectedValue(new Error("boom"));
    await request(createApp({ store })).get("/notes");
    expect(log).toHaveBeenCalled();
  });
});
