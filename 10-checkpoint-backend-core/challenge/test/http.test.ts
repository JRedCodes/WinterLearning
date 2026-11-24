import { afterEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { ALICE, as, setup } from "./helpers.js";

describe("cross-cutting HTTP behavior", () => {
  afterEach(() => vi.restoreAllMocks());

  describe("health", () => {
    it("GET /health is public and returns ok", async () => {
      const res = await request(setup().app).get("/health");
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ status: "ok" });
    });
  });

  describe("authentication via X-User-Id", () => {
    it("rejects /habits requests without X-User-Id with 401 UNAUTHENTICATED", async () => {
      const res = await request(setup().app).get("/habits");
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe("UNAUTHENTICATED");
    });

    it.each(["", "has spaces", "x".repeat(65), "semi;colon"])("rejects the malformed user id %j with 401", async (id) => {
      const res = await request(setup().app).get("/habits").set("X-User-Id", id);
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe("UNAUTHENTICATED");
    });

    it("checks authentication before validating the body", async () => {
      const res = await request(setup().app).post("/habits").send({});
      expect(res.status).toBe(401);
    });
  });

  describe("request ids", () => {
    it("sets X-Request-Id on every response, unique per request", async () => {
      const { app } = setup();
      const a = await request(app).get("/health");
      const b = await as(app, ALICE).get("/habits");
      expect(a.headers["x-request-id"]).toMatch(/^[A-Za-z0-9_-]{1,128}$/);
      expect(b.headers["x-request-id"]).toMatch(/^[A-Za-z0-9_-]{1,128}$/);
      expect(a.headers["x-request-id"]).not.toBe(b.headers["x-request-id"]);
    });

    it("reuses a valid incoming X-Request-Id and ignores an invalid one", async () => {
      const { app } = setup();
      const ok = await request(app).get("/health").set("X-Request-Id", "trace_abc-123");
      expect(ok.headers["x-request-id"]).toBe("trace_abc-123");
      const bad = await request(app).get("/health").set("X-Request-Id", "no spaces allowed");
      expect(bad.headers["x-request-id"]).not.toBe("no spaces allowed");
    });

    it("includes the request id in every error body", async () => {
      const res = await as(setup().app, ALICE).get("/habits/nope").set("X-Request-Id", "trace-10");
      expect(res.body.error).toMatchObject({ code: "HABIT_NOT_FOUND", requestId: "trace-10" });
      expect(res.body.error.message).toEqual(expect.any(String));
    });
  });

  describe("error handling", () => {
    it("returns JSON 404 ROUTE_NOT_FOUND for unknown routes", async () => {
      const res = await request(setup().app).get("/nope");
      expect(res.status).toBe(404);
      expect(res.headers["content-type"]).toMatch(/application\/json/);
      expect(res.body.error.code).toBe("ROUTE_NOT_FOUND");
    });

    it("turns malformed JSON into 400 INVALID_JSON", async () => {
      const res = await as(setup().app, ALICE)
        .post("/habits")
        .set("Content-Type", "application/json")
        .send('{"name": ');
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("INVALID_JSON");
    });

    it("turns unexpected errors into a generic, logged 500 that leaks nothing", async () => {
      const log = vi.spyOn(console, "error").mockImplementation(() => {});
      const brokenClock = {
        now(): Date {
          throw new Error("clock hardware failure on node-7");
        },
      };
      const res = await as(createApp({ clock: brokenClock }), ALICE).post("/habits").send({ name: "Read" });
      expect(res.status).toBe(500);
      expect(res.body.error).toMatchObject({ code: "INTERNAL_ERROR", message: "Something went wrong" });
      expect(res.body.error.requestId).toEqual(expect.any(String));
      expect(JSON.stringify(res.body)).not.toContain("node-7");
      expect(log).toHaveBeenCalled();
    });
  });
});
