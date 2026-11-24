import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { createProject, createTask, makeApp, walkPages, type App } from "./helpers/app.js";
import { expectConforms } from "./helpers/spec.js";

let app: App;
let projectId: string;
beforeEach(async () => {
  app = makeApp();
  projectId = (await createProject(app)).id;
});

describe("tasks · create, read, delete", () => {
  it("POST creates a task with defaults, Location and ETag", async () => {
    const res = await request(app).post(`/v1/projects/${projectId}/tasks`).send({ title: "Write spec" });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ projectId, title: "Write spec", status: "todo", priority: "medium", dueDate: null, version: 1 });
    expect(res.headers.location).toBe(`/v1/tasks/${res.body.id}`);
    expect(res.headers.etag).toBeDefined();
    expectConforms(res, "createTask");
  });

  it("POST to an unknown project → 404 problem", async () => {
    const res = await request(app).post("/v1/projects/7a1f0b2c-0000-4000-8000-000000000000/tasks").send({ title: "x" });
    expect(res.status).toBe(404);
    expectConforms(res, "createTask");
  });

  it("POST with invalid fields → 400 problem with pointers", async () => {
    const res = await request(app)
      .post(`/v1/projects/${projectId}/tasks`)
      .send({ title: "", status: "blocked", dueDate: "tomorrow" });
    expect(res.status).toBe(400);
    expectConforms(res, "createTask");
    const pointers = res.body.errors.map((e: { pointer: string }) => e.pointer).sort();
    expect(pointers).toEqual(["/dueDate", "/status", "/title"]);
  });

  it("GET /v1/tasks/:id → 200 conforming, 404 for unknown", async () => {
    const t = await createTask(app, projectId);
    const ok = await request(app).get(`/v1/tasks/${t.id}`);
    expect(ok.status).toBe(200);
    expect(ok.body.id).toBe(t.id);
    expectConforms(ok, "getTask");
    const missing = await request(app).get("/v1/tasks/nope");
    expect(missing.status).toBe(404);
    expectConforms(missing, "getTask");
  });

  it("DELETE → 204 with no body, then 404", async () => {
    const t = await createTask(app, projectId);
    const del = await request(app).delete(`/v1/tasks/${t.id}`);
    expect(del.status).toBe(204);
    expectConforms(del, "deleteTask");
    const again = await request(app).delete(`/v1/tasks/${t.id}`);
    expect(again.status).toBe(404);
    expectConforms(again, "deleteTask");
  });
});

describe("TODO(4a,5b) · GET /v1/projects/:projectId/tasks", () => {
  it("lists a project's tasks oldest first and conforms", async () => {
    const other = await createProject(app, "Other");
    await createTask(app, projectId, { title: "a" });
    await createTask(app, other.id, { title: "elsewhere" });
    await createTask(app, projectId, { title: "b" });
    const res = await request(app).get(`/v1/projects/${projectId}/tasks`);
    expect(res.status).toBe(200);
    expect(res.body.data.map((t: { title: string }) => t.title)).toEqual(["a", "b"]);
    expect(res.body.page).toEqual({ limit: 20, nextCursor: null });
    expectConforms(res, "listProjectTasks");
  });

  it("filters by status and sorts newest first with sort=-createdAt", async () => {
    await createTask(app, projectId, { title: "t1", status: "done" });
    await createTask(app, projectId, { title: "t2", status: "todo" });
    await createTask(app, projectId, { title: "t3", status: "done" });
    const res = await request(app).get(`/v1/projects/${projectId}/tasks?status=done&sort=-createdAt`);
    expect(res.body.data.map((t: { title: string }) => t.title)).toEqual(["t3", "t1"]);
  });

  it("paginates with a filter and a descending sort without duplicates or gaps", async () => {
    const titles = [];
    for (let i = 0; i < 7; i++) {
      await createTask(app, projectId, { title: `task ${i}`, priority: i % 2 ? "high" : "low", status: i === 3 ? "done" : "todo" });
      if (i !== 3) titles.push(`task ${i}`);
    }
    const pages = await walkPages(app, `/v1/projects/${projectId}/tasks?status=todo&sort=-createdAt&limit=4`);
    expect(pages.map((p) => p.data.length)).toEqual([4, 2]);
    expect(pages.flatMap((p) => p.data.map((t) => (t as unknown as { title: string }).title))).toEqual(titles.reverse());
  });

  it("rejects a cursor from a different sort order", async () => {
    for (let i = 0; i < 3; i++) await createTask(app, projectId, { title: `t${i}` });
    const first = await request(app).get(`/v1/projects/${projectId}/tasks?limit=1&sort=-createdAt`);
    const res = await request(app).get(`/v1/projects/${projectId}/tasks?limit=1&sort=createdAt&cursor=${first.body.page.nextCursor}`);
    expect(res.status).toBe(400);
    expectConforms(res, "listProjectTasks");
  });

  it("404 for an unknown project, 400 for invalid query parameters", async () => {
    const missing = await request(app).get("/v1/projects/7a1f0b2c-0000-4000-8000-000000000000/tasks");
    expect(missing.status).toBe(404);
    expectConforms(missing, "listProjectTasks");
    const bad = await request(app).get(`/v1/projects/${projectId}/tasks?status=blocked&sort=title`);
    expect(bad.status).toBe(400);
    expectConforms(bad, "listProjectTasks");
  });
});
