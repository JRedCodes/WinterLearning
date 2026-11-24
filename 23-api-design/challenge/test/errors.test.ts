import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import type { IdempotencyStore } from "../src/repositories/idempotencyStore.js";
import { createProject, makeApp } from "./helpers/app.js";
import { expectMatchesSchema } from "./helpers/spec.js";

const BASE = "https://api.wl.example/problems/";

describe("TODO(2) · RFC 9457 problem details", () => {
  it("unknown routes → 404 application/problem+json", async () => {
    const res = await request(makeApp()).get("/v1/nothing-here?x=1");
    expect(res.status).toBe(404);
    expect(res.headers["content-type"]).toMatch(/^application\/problem\+json/);
    expect(res.body).toEqual({
      type: `${BASE}not-found`,
      title: "Not Found",
      status: 404,
      detail: "No route for GET /v1/nothing-here",
      instance: "/v1/nothing-here?x=1",
    });
    expectMatchesSchema(res.body, "#/components/schemas/Problem");
  });

  it("domain errors carry type, title, status, detail and instance", async () => {
    const res = await request(makeApp()).get("/v1/tasks/abc");
    expect(res.headers["content-type"]).toMatch(/^application\/problem\+json/);
    expect(res.body).toEqual({
      type: `${BASE}not-found`,
      title: "Not Found",
      status: 404,
      detail: "Task not found",
      instance: "/v1/tasks/abc",
    });
  });

  it("validation errors add an `errors` array of { pointer, detail }", async () => {
    const res = await request(makeApp()).post("/v1/projects").send({ name: 42 });
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ type: `${BASE}validation-error`, title: "Validation Failed", status: 400 });
    expect(res.body.errors).toEqual([{ pointer: "/name", detail: expect.any(String) }]);
    expectMatchesSchema(res.body, "#/components/schemas/Problem");
  });

  it("omits `errors` when there are no field errors", async () => {
    const res = await request(makeApp()).get("/v1/projects/missing");
    expect(res.body).not.toHaveProperty("errors");
  });

  it("malformed JSON → 400 validation-error problem", async () => {
    const res = await request(makeApp()).post("/v1/projects").set("Content-Type", "application/json").send('{"name": ');
    expect(res.status).toBe(400);
    expect(res.headers["content-type"]).toMatch(/^application\/problem\+json/);
    expect(res.body).toMatchObject({ type: `${BASE}validation-error`, status: 400, detail: "Request body is not valid JSON" });
  });

  it("unexpected errors → 500 about:blank, without leaking internals", async () => {
    const broken: IdempotencyStore = {
      get: async () => {
        throw new Error("connection to redis-prod-7.internal refused");
      },
      begin: async () => false,
      complete: async () => {},
      release: async () => {},
    };
    const app = createApp({ idempotencyStore: broken });
    const project = await createProject(app);
    const original = console.error;
    console.error = () => {}; // keep test output clean; the handler should still log
    try {
      const res = await request(app).post(`/v1/projects/${project.id}/tasks`).set("Idempotency-Key", "k").send({ title: "x" });
      expect(res.status).toBe(500);
      expect(res.headers["content-type"]).toMatch(/^application\/problem\+json/);
      expect(res.body).toMatchObject({ type: "about:blank", title: "Internal Server Error", status: 500 });
      expect(JSON.stringify(res.body)).not.toContain("redis-prod");
    } finally {
      console.error = original;
    }
  });

  it("uses the configured base URL for problem types", async () => {
    const res = await request(createApp({ problemBaseUrl: "https://docs.example.com/errors/" })).get("/nope");
    expect(res.body.type).toBe("https://docs.example.com/errors/not-found");
  });
});
