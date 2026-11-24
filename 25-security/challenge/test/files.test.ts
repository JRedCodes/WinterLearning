import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { SECRET, setupTestApp, type TestApp } from "./helpers.js";

let t: TestApp;

beforeAll(async () => {
  t = await setupTestApp();
  await request(t.app)
    .post("/files")
    .set("Authorization", t.users.alice.auth)
    .send({ name: "todo.txt", content: "buy milk" })
    .expect(201);
  await request(t.app)
    .post("/files")
    .set("Authorization", t.users.bob.auth)
    .send({ name: "bob-private.txt", content: "bob's diary" })
    .expect(201);
});
afterAll(() => t.cleanup());

describe("downloads: work", () => {
  it("downloads my own file as an attachment", async () => {
    const res = await request(t.app).get("/files/download").query({ name: "todo.txt" }).set("Authorization", t.users.alice.auth);
    expect(res.status).toBe(200);
    expect(res.text).toBe("buy milk");
    expect(res.headers["content-disposition"]).toMatch(/^attachment/);
  });

  it("404s for a file I don't have", async () => {
    await request(t.app).get("/files/download").query({ name: "nope.txt" }).set("Authorization", t.users.alice.auth).expect(404);
  });

  it("rejects upload names that are paths", async () => {
    for (const name of ["../evil.txt", "a/b.txt", ".hidden"]) {
      await request(t.app).post("/files").set("Authorization", t.users.alice.auth).send({ name, content: "x" }).expect(400);
    }
  });
});

describe("finding 2: path traversal in download", () => {
  const attempts = [
    "../secret.txt",
    "../../secret.txt",
    "../../.env",
    "..%2F..%2Fsecret.txt",
    "....//....//secret.txt",
    "/etc/passwd",
    "todo.txt/../../secret.txt",
  ];

  for (const name of attempts) {
    it(`does not serve files outside my folder: ${JSON.stringify(name)}`, async () => {
      const res = await request(t.app).get("/files/download").query({ name }).set("Authorization", t.users.alice.auth);
      expect([400, 404]).toContain(res.status);
      expect(res.text).not.toContain(SECRET);
      expect(res.text).not.toContain("root:");
    });
  }

  it("does not serve another user's file via ../<their id>/", async () => {
    const res = await request(t.app)
      .get("/files/download")
      .query({ name: `../${t.users.bob.id}/bob-private.txt` })
      .set("Authorization", t.users.alice.auth);
    expect([400, 404]).toContain(res.status);
    expect(res.text).not.toContain("diary");
  });
});
