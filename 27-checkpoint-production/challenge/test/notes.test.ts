import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestEnv, loginAs, type TestEnv } from "./helpers/env.js";

let env: TestEnv;
beforeAll(async () => {
  env = await createTestEnv();
});
beforeEach(() => env.reset());
afterAll(() => env.close());

describe("authentication on /notes", () => {
  it.each([
    ["get", "/notes"],
    ["post", "/notes"],
    ["get", "/notes/7d0f3c8e-0000-4000-8000-000000000000"],
    ["patch", "/notes/7d0f3c8e-0000-4000-8000-000000000000"],
    ["delete", "/notes/7d0f3c8e-0000-4000-8000-000000000000"],
  ] as const)("%s %s without a session -> 401", async (method, path) => {
    const res = await request(env.app())[method](path).send({ title: "x" });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHENTICATED");
  });
});

describe("ownership", () => {
  it("creates notes owned by the session user and ignores ownerId in the body", async () => {
    const app = env.app();
    const ada = await loginAs(app, "ada@example.com");
    const bob = await loginAs(app, "bob@example.com");
    const res = await request(app).post("/notes").set("Cookie", ada.cookie).send({ title: "plan", body: "b", ownerId: bob.user.id });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ title: "plan", body: "b" });
    const { rows } = await env.pool.query<{ owner_id: string }>("SELECT owner_id FROM notes WHERE id = $1", [res.body.data.id]);
    expect(rows[0]?.owner_id, "mass assignment: owner must come from the session").toBe(ada.user.id);
  });

  it("lists only your own notes", async () => {
    const app = env.app();
    const ada = await loginAs(app, "ada@example.com");
    const bob = await loginAs(app, "bob@example.com");
    await request(app).post("/notes").set("Cookie", ada.cookie).send({ title: "ada 1" });
    await request(app).post("/notes").set("Cookie", bob.cookie).send({ title: "bob 1" });
    await request(app).post("/notes").set("Cookie", ada.cookie).send({ title: "ada 2" });
    const res = await request(app).get("/notes").set("Cookie", ada.cookie);
    expect(res.status).toBe(200);
    expect(res.body.data.map((n: { title: string }) => n.title)).toEqual(["ada 1", "ada 2"]);
  });

  it("answers 404 (not 403) for someone else's note, and leaves it untouched", async () => {
    const app = env.app();
    const ada = await loginAs(app, "ada@example.com");
    const bob = await loginAs(app, "bob@example.com");
    const note = (await request(app).post("/notes").set("Cookie", ada.cookie).send({ title: "secret" })).body.data;

    const get = await request(app).get(`/notes/${note.id}`).set("Cookie", bob.cookie);
    const patch = await request(app).patch(`/notes/${note.id}`).set("Cookie", bob.cookie).send({ title: "pwned" });
    const del = await request(app).delete(`/notes/${note.id}`).set("Cookie", bob.cookie);
    for (const res of [get, patch, del]) {
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe("NOT_FOUND");
    }
    const still = await request(app).get(`/notes/${note.id}`).set("Cookie", ada.cookie);
    expect(still.body.data.title).toBe("secret");
  });

  it("lets the owner read, update and delete", async () => {
    const app = env.app();
    const ada = await loginAs(app, "ada@example.com");
    const note = (await request(app).post("/notes").set("Cookie", ada.cookie).send({ title: "draft" })).body.data;
    expect((await request(app).get(`/notes/${note.id}`).set("Cookie", ada.cookie)).body.data.title).toBe("draft");
    const patched = await request(app).patch(`/notes/${note.id}`).set("Cookie", ada.cookie).send({ body: "more" });
    expect(patched.status).toBe(200);
    expect(patched.body.data).toMatchObject({ title: "draft", body: "more" });
    expect((await request(app).delete(`/notes/${note.id}`).set("Cookie", ada.cookie)).status).toBe(204);
    expect((await request(app).get(`/notes/${note.id}`).set("Cookie", ada.cookie)).status).toBe(404);
  });
});

describe("input validation", () => {
  it.each([
    [{}, "title"],
    [{ title: "" }, "title"],
    [{ title: "x".repeat(201) }, "title"],
    [{ title: "ok", body: 42 }, "body"],
    [{ title: "ok", body: "x".repeat(10_001) }, "body"],
  ])("POST /notes %# -> 400 VALIDATION_ERROR on %s", async (body, field) => {
    const app = env.app();
    const { cookie } = await loginAs(app, "ada@example.com");
    const res = await request(app).post("/notes").set("Cookie", cookie).send(body);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(res.body.error.details).toEqual(expect.arrayContaining([expect.objectContaining({ path: field })]));
  });

  it("rejects an empty PATCH", async () => {
    const app = env.app();
    const { cookie } = await loginAs(app, "ada@example.com");
    const note = (await request(app).post("/notes").set("Cookie", cookie).send({ title: "t" })).body.data;
    const res = await request(app).patch(`/notes/${note.id}`).set("Cookie", cookie).send({});
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects a malformed note id with 400 instead of a database error", async () => {
    const app = env.app();
    const { cookie } = await loginAs(app, "ada@example.com");
    const res = await request(app).get("/notes/not-a-uuid").set("Cookie", cookie);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("turns malformed JSON into 400 INVALID_JSON", async () => {
    const app = env.app();
    const { cookie } = await loginAs(app, "ada@example.com");
    const res = await request(app).post("/notes").set("Cookie", cookie).set("Content-Type", "application/json").send('{"title":');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("INVALID_JSON");
  });

  it("rejects bodies over 100kb with 413 PAYLOAD_TOO_LARGE", async () => {
    const app = env.app();
    const { cookie } = await loginAs(app, "ada@example.com");
    const res = await request(app).post("/notes").set("Cookie", cookie).send({ title: "big", body: "x".repeat(150_000) });
    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe("PAYLOAD_TOO_LARGE");
  });
});
