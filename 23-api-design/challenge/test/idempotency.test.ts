import { createHash } from "node:crypto";
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { InMemoryIdempotencyStore } from "../src/repositories/idempotencyStore.js";
import { createProject, makeApp, tickingClock, type App } from "./helpers/app.js";
import { expectConforms } from "./helpers/spec.js";

let store: InMemoryIdempotencyStore;
let app: App;
let projectId: string;
let url: string;

beforeEach(async () => {
  store = new InMemoryIdempotencyStore();
  app = makeApp({ idempotencyStore: store });
  projectId = (await createProject(app)).id;
  url = `/v1/projects/${projectId}/tasks`;
});

const listTitles = async () =>
  (await request(app).get(url)).body.data?.map((t: { title: string }) => t.title) ?? "list endpoint not implemented";
const post = (body: object, key?: string) => {
  const req = request(app).post(url);
  if (key !== undefined) req.set("Idempotency-Key", key);
  return req.send(body);
};
const fingerprint = (body: unknown) => createHash("sha256").update(JSON.stringify(body)).digest("hex");

describe("TODO(6) · Idempotency-Key on POST /v1/projects/:id/tasks", () => {
  it("a retry with the same key and body replays the original response and creates nothing new", async () => {
    const first = await post({ title: "Pay invoice" }, "key-123");
    const retry = await post({ title: "Pay invoice" }, "key-123");
    expect(first.status).toBe(201);
    expect(retry.status).toBe(201);
    expect(retry.body).toEqual(first.body);
    expect(retry.headers.location).toBe(first.headers.location);
    expect(retry.headers.etag).toBe(first.headers.etag);
    expect(retry.headers["idempotent-replayed"]).toBe("true");
    expect(first.headers["idempotent-replayed"]).toBeUndefined();
    expectConforms(retry, "createTask");
    expect(await listTitles()).toEqual(["Pay invoice"]);
  });

  it("different keys, or no key, create separate tasks", async () => {
    await post({ title: "A" }, "k1");
    await post({ title: "A" }, "k2");
    await post({ title: "A" });
    await post({ title: "A" });
    expect(await listTitles()).toEqual(["A", "A", "A", "A"]);
  });

  it("reusing a key with a different body → 422 problem", async () => {
    await post({ title: "Pay invoice" }, "key-123");
    const res = await post({ title: "Pay invoice twice" }, "key-123");
    expect(res.status).toBe(422);
    expect(res.body.type).toMatch(/\/idempotency-key-reused$/);
    expectConforms(res, "createTask");
  });

  it("a request whose key is still in progress → 409 problem", async () => {
    const body = { title: "Slow" };
    await store.begin(`POST ${url} key-busy`, fingerprint(body));
    const res = await post(body, "key-busy");
    expect(res.status).toBe(409);
    expect(res.body.type).toMatch(/\/idempotency-key-in-flight$/);
    expectConforms(res, "createTask");
  });

  it("an in-progress key with a different body → 422", async () => {
    await store.begin(`POST ${url} key-busy`, fingerprint({ title: "something else" }));
    const res = await post({ title: "Slow" }, "key-busy");
    expect(res.status).toBe(422);
  });

  it("keys are scoped to the endpoint: the same key on another project is a different operation", async () => {
    const other = await createProject(app, "Other");
    await post({ title: "Same" }, "shared-key");
    const res = await request(app).post(`/v1/projects/${other.id}/tasks`).set("Idempotency-Key", "shared-key").send({ title: "Same" });
    expect(res.status).toBe(201);
    expect(res.headers["idempotent-replayed"]).toBeUndefined();
  });

  it("4xx outcomes are stored too (a retry gets the same 404)", async () => {
    const missing = "/v1/projects/7a1f0b2c-0000-4000-8000-000000000000/tasks";
    const first = await request(app).post(missing).set("Idempotency-Key", "k404").send({ title: "x" });
    const retry = await request(app).post(missing).set("Idempotency-Key", "k404").send({ title: "x" });
    expect(first.status).toBe(404);
    expect(retry.status).toBe(404);
    expect(retry.headers["idempotent-replayed"]).toBe("true");
  });

  it("5xx outcomes are NOT stored, so the client can retry", async () => {
    let broken = false;
    const base = tickingClock();
    const flaky = createApp({ idempotencyStore: store, clock: () => (broken ? (() => { throw new Error("db down"); })() : base()) });
    const p = await request(flaky).post("/v1/projects").send({ name: "P" });
    const path = `/v1/projects/${p.body.id}/tasks`;
    broken = true;
    const failed = await request(flaky).post(path).set("Idempotency-Key", "k5xx").send({ title: "x" });
    expect(failed.status).toBe(500);
    broken = false;
    const retry = await request(flaky).post(path).set("Idempotency-Key", "k5xx").send({ title: "x" });
    expect(retry.status).toBe(201);
    expect(retry.headers["idempotent-replayed"]).toBeUndefined();
  });

  it.each([["empty", ""], ["too long", "k".repeat(256)]])("rejects an %s key with 400", async (_label, key) => {
    const res = await post({ title: "x" }, key);
    expect(res.status).toBe(400);
    expectConforms(res, "createTask");
  });
});
