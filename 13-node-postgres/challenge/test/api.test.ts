import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import type pg from "pg";
import { createApp } from "../src/app.js";
import { PgTaskRepository } from "../src/repositories/pgTaskRepository.js";
import { TaskService } from "../src/services/taskService.js";
import { applySchema, createTestPool, truncateAll } from "./helpers/db.js";

/** End to end through HTTP, backed by your PgTaskRepository. */
let pool: pg.Pool;
let app: ReturnType<typeof createApp>;

beforeAll(async () => {
  pool = createTestPool();
  await applySchema(pool);
  app = createApp({ taskService: new TaskService(new PgTaskRepository(pool)) });
});
afterAll(async () => {
  await pool?.end();
});
beforeEach(async () => {
  await truncateAll(pool);
});

async function newProject(name = "Website"): Promise<string> {
  const res = await request(app).post("/projects").send({ name });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return res.body.data.id as string;
}

describe("tasks API on Postgres", () => {
  it("creates a project and a task with correctly typed JSON", async () => {
    const projectId = await newProject();
    const res = await request(app)
      .post(`/projects/${projectId}/tasks`)
      .send({ title: "Launch", estimateHours: 1.25, dueDate: "2026-07-04" });

    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.headers.location).toBe(`/tasks/${res.body.data.id}`);
    expect(res.body.data).toMatchObject({
      projectId,
      title: "Launch",
      status: "todo",
      estimateHours: 1.25,
      dueDate: "2026-07-04",
    });
    expect(res.body.data.id).toMatch(/^\d+$/);
    expect(Date.parse(res.body.data.createdAt)).not.toBeNaN();
  });

  it("lists, filters, updates and deletes", async () => {
    const projectId = await newProject();
    const a = (await request(app).post(`/projects/${projectId}/tasks`).send({ title: "Alpha" })).body.data;
    await request(app).post(`/projects/${projectId}/tasks`).send({ title: "Beta", status: "done" });

    const done = await request(app).get("/tasks").query({ projectId, status: "done" });
    expect(done.body.data.map((t: { title: string }) => t.title)).toEqual(["Beta"]);

    const patched = await request(app).patch(`/tasks/${a.id}`).send({ status: "in_progress" });
    expect(patched.status).toBe(200);
    expect(patched.body.data).toMatchObject({ title: "Alpha", status: "in_progress" });

    expect((await request(app).delete(`/tasks/${a.id}`)).status).toBe(204);
    expect((await request(app).get(`/tasks/${a.id}`)).body.error.code).toBe("TASK_NOT_FOUND");
  });

  it("returns 404 PROJECT_NOT_FOUND when creating a task in a missing project", async () => {
    const res = await request(app).post("/projects/424242/tasks").send({ title: "Orphan" });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("PROJECT_NOT_FOUND");
  });

  it("POST /tasks/move is atomic", async () => {
    const fromId = await newProject("From");
    const toId = await newProject("To");
    const t1 = (await request(app).post(`/projects/${fromId}/tasks`).send({ title: "one" })).body.data;

    const res = await request(app).post("/tasks/move").send({ taskIds: [t1.id, "999999"], toProjectId: toId });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("TASK_NOT_FOUND");
    const after = await request(app).get(`/tasks/${t1.id}`);
    expect(after.body.data.projectId, "the partial move must have been rolled back").toBe(fromId);

    const ok = await request(app).post("/tasks/move").send({ taskIds: [t1.id], toProjectId: toId });
    expect(ok.status).toBe(200);
    expect(ok.body.data[0].projectId).toBe(toId);
  });

  it("returns a generic 500 when the database is unavailable", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const deadPool = createTestPool({ connectionString: "postgres://postgres:postgres@127.0.0.1:1/nope", connectionTimeoutMillis: 500 });
    const brokenApp = createApp({ taskService: new TaskService(new PgTaskRepository(deadPool)) });
    const res = await request(brokenApp).get("/tasks");
    expect(res.status).toBe(500);
    expect(res.body.error).toEqual({ code: "INTERNAL_ERROR", message: "Something went wrong" });
    await deadPool.end();
    vi.restoreAllMocks();
  });
});
