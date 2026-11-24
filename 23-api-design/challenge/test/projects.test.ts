import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { createProject, makeApp, walkPages, type App } from "./helpers/app.js";
import { expectConforms } from "./helpers/spec.js";

let app: App;
beforeEach(() => {
  app = makeApp();
});

describe("projects (given code, checked against YOUR spec)", () => {
  it("POST /v1/projects → 201 + Location, conforming to the spec", async () => {
    const res = await request(app).post("/v1/projects").send({ name: "Launch", description: "Q3 launch" });
    expect(res.status).toBe(201);
    expect(res.headers.location).toBe(`/v1/projects/${res.body.id}`);
    expectConforms(res, "createProject");
  });

  it("GET /v1/projects/:id → 200 and 404 problem", async () => {
    const p = await createProject(app);
    const ok = await request(app).get(`/v1/projects/${p.id}`);
    expectConforms(ok, "getProject");
    const missing = await request(app).get("/v1/projects/7a1f0b2c-0000-4000-8000-000000000000");
    expect(missing.status).toBe(404);
    expectConforms(missing, "getProject");
  });

  it("rejects invalid and unknown fields with a 400 problem listing field errors", async () => {
    const res = await request(app).post("/v1/projects").send({ name: "", color: "red" });
    expect(res.status).toBe(400);
    expectConforms(res, "createProject");
    const pointers = res.body.errors.map((e: { pointer: string }) => e.pointer);
    expect(pointers).toContain("/name");
  });
});

describe("TODO(3) · cursor pagination on GET /v1/projects", () => {
  it("walks every project exactly once, in creation order", async () => {
    const created = [];
    for (let i = 0; i < 5; i++) created.push((await createProject(app, `p${i}`)).id);
    const pages = await walkPages(app, "/v1/projects?limit=2");
    expect(pages.map((p) => p.data.length)).toEqual([2, 2, 1]);
    expect(pages.flatMap((p) => p.data.map((d) => d.id))).toEqual(created);
    expect(pages.at(-1)!.page.nextCursor).toBeNull();
    expect(pages[0]!.page.limit).toBe(2);
  });

  it("returns nextCursor null when everything fits, and conforms", async () => {
    await createProject(app);
    const res = await request(app).get("/v1/projects");
    expect(res.body.page).toEqual({ limit: 20, nextCursor: null });
    expectConforms(res, "listProjects");
  });

  it("is stable when items are added between pages (no duplicates, no skips)", async () => {
    const ids = [];
    for (let i = 0; i < 3; i++) ids.push((await createProject(app, `p${i}`)).id);
    const first = await request(app).get("/v1/projects?limit=2");
    ids.push((await createProject(app, "late")).id);
    const second = await request(app).get(`/v1/projects?limit=2&cursor=${first.body.page.nextCursor}`);
    expect([...first.body.data, ...second.body.data].map((p: { id: string }) => p.id)).toEqual(ids);
  });

  it.each(["0", "101", "abc"])("rejects limit=%s with a 400 problem", async (limit) => {
    const res = await request(app).get(`/v1/projects?limit=${limit}`);
    expect(res.status).toBe(400);
    expectConforms(res, "listProjects");
  });

  it("rejects a garbage cursor with a 400 problem pointing at /cursor", async () => {
    const res = await request(app).get("/v1/projects?cursor=definitely-not-valid");
    expect(res.status).toBe(400);
    expectConforms(res, "listProjects");
    expect(res.body.errors[0].pointer).toBe("/cursor");
  });
});
