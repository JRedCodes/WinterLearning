import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { etagFor, ifNoneMatchHits, parseIfMatch } from "../src/lib/etag.js";
import { createProject, createTask, makeApp, type App } from "./helpers/app.js";
import { expectConforms } from "./helpers/spec.js";

describe("TODO(5a) · ETag helpers", () => {
  it("etagFor quotes the version", () => {
    expect(etagFor(3)).toBe('"3"');
  });

  it.each([
    [undefined, undefined],
    ["", undefined],
    ["*", "*"],
    ['"3"', [3]],
    ['"3", "4"', [3, 4]],
    ['W/"3"', []],
    ["3", []],
    ['"abc"', []],
  ] as const)("parseIfMatch(%j) → %j", (header, expected) => {
    expect(parseIfMatch(header)).toEqual(expected);
  });

  it("ifNoneMatchHits uses weak comparison and supports lists and *", () => {
    expect(ifNoneMatchHits('"3"', 3)).toBe(true);
    expect(ifNoneMatchHits('W/"3"', 3)).toBe(true);
    expect(ifNoneMatchHits('"1", "3"', 3)).toBe(true);
    expect(ifNoneMatchHits("*", 3)).toBe(true);
    expect(ifNoneMatchHits('"2"', 3)).toBe(false);
    expect(ifNoneMatchHits(undefined, 3)).toBe(false);
  });
});

describe("TODO(4b,5b) · conditional requests on /v1/tasks/:id", () => {
  let app: App;
  let taskId: string;
  beforeEach(async () => {
    app = makeApp();
    const project = await createProject(app);
    taskId = (await createTask(app, project.id, { title: "Draft" })).id;
  });

  const patch = (body: object, ifMatch?: string) => {
    const req = request(app).patch(`/v1/tasks/${taskId}`).set("Content-Type", "application/merge-patch+json");
    if (ifMatch !== undefined) req.set("If-Match", ifMatch);
    return req.send(JSON.stringify(body));
  };

  it("GET returns an ETag, and If-None-Match with it returns 304 with no body", async () => {
    const first = await request(app).get(`/v1/tasks/${taskId}`);
    expect(first.headers.etag).toBe('"1"');
    const cached = await request(app).get(`/v1/tasks/${taskId}`).set("If-None-Match", first.headers.etag!);
    expect(cached.status).toBe(304);
    expect(cached.text ?? "").toBe("");
    expect(cached.headers.etag).toBe('"1"');
    expectConforms(cached, "getTask");
  });

  it("PATCH without If-Match → 428 problem", async () => {
    const res = await patch({ title: "x" });
    expect(res.status).toBe(428);
    expect(res.body.type).toMatch(/\/precondition-required$/);
    expectConforms(res, "updateTask");
  });

  it("PATCH with the current ETag → 200, new version and new ETag", async () => {
    const res = await patch({ status: "in_progress" }, '"1"');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: "in_progress", title: "Draft", version: 2 });
    expect(res.headers.etag).toBe('"2"');
    expectConforms(res, "updateTask");
  });

  it("prevents the lost update: the second writer with a stale ETag gets 412", async () => {
    const alice = await request(app).get(`/v1/tasks/${taskId}`);
    const bob = await request(app).get(`/v1/tasks/${taskId}`);
    expect((await patch({ title: "Alice's title" }, alice.headers.etag)).status).toBe(200);
    const res = await patch({ title: "Bob's title" }, bob.headers.etag);
    expect(res.status).toBe(412);
    expect(res.body.type).toMatch(/\/precondition-failed$/);
    expectConforms(res, "updateTask");
    expect((await request(app).get(`/v1/tasks/${taskId}`)).body.title).toBe("Alice's title");
  });

  it("weak ETags never satisfy If-Match; * does", async () => {
    expect((await patch({ title: "w" }, 'W/"1"')).status).toBe(412);
    expect((await patch({ title: "star" }, "*")).status).toBe(200);
  });

  it("merge-patch semantics: absent fields unchanged, dueDate null clears it", async () => {
    expect((await patch({ dueDate: "2026-03-01", priority: "high" }, '"1"')).status).toBe(200);
    const res = await patch({ dueDate: null }, '"2"');
    expect(res.body).toMatchObject({ dueDate: null, priority: "high", title: "Draft" });
  });

  it("invalid or empty patches → 400; unknown task → 404", async () => {
    const empty = await patch({}, '"1"');
    expect(empty.status).toBe(400);
    expectConforms(empty, "updateTask");
    const invalid = await patch({ status: "blocked" }, '"1"');
    expect(invalid.status).toBe(400);
    const missing = await request(app).patch("/v1/tasks/nope").set("If-Match", '"1"').send({ title: "x" });
    expect(missing.status).toBe(404);
    expectConforms(missing, "updateTask");
  });
});
