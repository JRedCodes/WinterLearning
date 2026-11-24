import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";

type App = ReturnType<typeof createApp>;

async function createNote(app: App, title: string, body = "") {
  const res = await request(app).post("/notes").send({ title, body });
  expect(res.status, `POST /notes failed: ${JSON.stringify(res.body)}`).toBe(201);
  return res.body.data as { id: string; title: string; body: string };
}

describe("notes API", () => {
  let app: App;
  beforeEach(() => {
    app = createApp(); // fresh in-memory store per test
  });

  describe("GET /health", () => {
    it("returns ok", async () => {
      const res = await request(app).get("/health");
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ status: "ok" });
    });
  });

  describe("POST /notes (TODO 4)", () => {
    it("creates a note, returns 201, Location header and the note", async () => {
      const res = await request(app).post("/notes").send({ title: "  Groceries ", body: "milk" });
      expect(res.status).toBe(201);
      expect(res.body.data).toMatchObject({ title: "Groceries", body: "milk" });
      expect(res.body.data.id).toEqual(expect.any(String));
      expect(res.body.data.createdAt).toEqual(expect.any(String));
      expect(res.headers.location).toBe(`/notes/${res.body.data.id}`);
    });

    it("defaults body to an empty string", async () => {
      const res = await request(app).post("/notes").send({ title: "Just a title" });
      expect(res.status).toBe(201);
      expect(res.body.data.body).toBe("");
    });

    it.each([
      ["missing title", { body: "x" }],
      ["blank title", { title: "   " }],
      ["non-string title", { title: 42 }],
      ["title over 100 chars", { title: "a".repeat(101) }],
      ["non-string body", { title: "ok", body: ["x"] }],
      ["body over 5000 chars", { title: "ok", body: "b".repeat(5001) }],
    ])("rejects %s with 400 VALIDATION_ERROR", async (_label, payload) => {
      const res = await request(app).post("/notes").send(payload);
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
      expect(res.body.error.message).toEqual(expect.any(String));
    });
  });

  describe("GET /notes (TODO 2)", () => {
    it("lists notes in creation order", async () => {
      await createNote(app, "first");
      await createNote(app, "second");
      const res = await request(app).get("/notes");
      expect(res.status).toBe(200);
      expect(res.body.data.map((n: { title: string }) => n.title)).toEqual(["first", "second"]);
    });

    it("filters with ?q= across title and body, case-insensitively", async () => {
      await createNote(app, "Buy MILK");
      await createNote(app, "Call mom", "about the milkshake recipe");
      await createNote(app, "Gym");
      const res = await request(app).get("/notes").query({ q: "milk" });
      expect(res.status).toBe(200);
      expect(res.body.data.map((n: { title: string }) => n.title)).toEqual(["Buy MILK", "Call mom"]);
    });

    it("applies ?limit= and defaults to 20", async () => {
      for (let i = 0; i < 25; i++) await createNote(app, `note ${i}`);
      const all = await request(app).get("/notes");
      expect(all.body.data).toHaveLength(20);
      const three = await request(app).get("/notes").query({ limit: "3" });
      expect(three.body.data).toHaveLength(3);
    });

    it.each(["0", "101", "abc", "2.5", "-1"])("rejects limit=%s with 400", async (limit) => {
      const res = await request(app).get("/notes").query({ limit });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    });
  });

  describe("GET /notes/:id (TODO 3)", () => {
    it("returns the note", async () => {
      const note = await createNote(app, "hello");
      const res = await request(app).get(`/notes/${note.id}`);
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({ id: note.id, title: "hello" });
    });

    it("returns 404 NOT_FOUND for a missing note", async () => {
      const res = await request(app).get("/notes/999");
      expect(res.status).toBe(404);
      expect(res.body.error).toMatchObject({ code: "NOT_FOUND", message: "Note not found" });
    });
  });

  describe("PATCH /notes/:id (TODO 4)", () => {
    it("updates only the provided fields", async () => {
      const note = await createNote(app, "old title", "keep me");
      const res = await request(app).patch(`/notes/${note.id}`).send({ title: "new title" });
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({ title: "new title", body: "keep me" });
    });

    it("rejects an empty patch", async () => {
      const note = await createNote(app, "x");
      const res = await request(app).patch(`/notes/${note.id}`).send({});
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    });

    it("rejects invalid fields", async () => {
      const note = await createNote(app, "x");
      const res = await request(app).patch(`/notes/${note.id}`).send({ title: "" });
      expect(res.status).toBe(400);
    });

    it("returns 404 for a missing note", async () => {
      const res = await request(app).patch("/notes/999").send({ title: "x" });
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe("NOT_FOUND");
    });
  });

  describe("DELETE /notes/:id (TODO 4)", () => {
    it("deletes and returns 204 with no body", async () => {
      const note = await createNote(app, "bye");
      const res = await request(app).delete(`/notes/${note.id}`);
      expect(res.status).toBe(204);
      expect(res.text).toBe("");
      const after = await request(app).get(`/notes/${note.id}`);
      expect(after.status).toBe(404);
    });

    it("returns 404 for a missing note", async () => {
      const res = await request(app).delete("/notes/999");
      expect(res.status).toBe(404);
    });
  });
});
