import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { setupTestApp, type TestApp } from "./helpers.js";

let t: TestApp;

beforeAll(async () => {
  t = await setupTestApp();
  const { alice, bob } = t.users;
  for (const name of ["notes.txt", "q3 report's draft.txt", "holiday.jpg"]) {
    await request(t.app).post("/files").set("Authorization", alice.auth).send({ name, content: `alice: ${name}` }).expect(201);
  }
  await request(t.app).post("/files").set("Authorization", bob.auth).send({ name: "bob-salary.txt", content: "bob" }).expect(201);
});
afterAll(() => t.cleanup());

describe("file search: works", () => {
  it("lists only my files, sorted by name", async () => {
    const res = await request(t.app).get("/files").set("Authorization", t.users.alice.auth).expect(200);
    expect(res.body.data.map((f: { name: string }) => f.name)).toEqual(["holiday.jpg", "notes.txt", "q3 report's draft.txt"]);
  });

  it("finds files by case-insensitive substring", async () => {
    const res = await request(t.app).get("/files").query({ search: "NOTE" }).set("Authorization", t.users.alice.auth).expect(200);
    expect(res.body.data.map((f: { name: string }) => f.name)).toEqual(["notes.txt"]);
  });

  it("handles search terms containing a quote (pentest finding 1: this returned 500)", async () => {
    const res = await request(t.app).get("/files").query({ search: "report's" }).set("Authorization", t.users.alice.auth);
    expect(res.status).toBe(200);
    expect(res.body.data.map((f: { name: string }) => f.name)).toEqual(["q3 report's draft.txt"]);
  });
});

describe("finding 1: SQL injection in search", () => {
  it("a tautology does not reveal other users' files", async () => {
    const res = await request(t.app).get("/files").query({ search: "' OR 1=1 --" }).set("Authorization", t.users.alice.auth);
    expect(res.status).toBe(200);
    for (const f of res.body.data as { ownerId: number }[]) expect(f.ownerId).toBe(t.users.alice.id);
    expect(JSON.stringify(res.body)).not.toContain("bob-salary");
  });

  it("a UNION does not leak data from other tables", async () => {
    const payload = "zzz' UNION SELECT id, id, email, 0, 'x', now() FROM users --";
    const res = await request(t.app).get("/files").query({ search: payload }).set("Authorization", t.users.alice.auth);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(JSON.stringify(res.body)).not.toContain("root@example.com");
  });

  it("stacked queries can't modify data", async () => {
    await request(t.app)
      .get("/files")
      .query({ search: "x'; UPDATE users SET is_admin = true WHERE email = 'alice@example.com'; --" })
      .set("Authorization", t.users.alice.auth);
    const { rows } = await t.pool.query("SELECT is_admin FROM users WHERE id = $1", [t.users.alice.id]);
    expect(rows[0].is_admin).toBe(false);
  });
});
