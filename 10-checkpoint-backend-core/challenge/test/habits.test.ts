import { beforeEach, describe, expect, it } from "vitest";
import { ALICE, BOB, as, createHabit, setup, type App } from "./helpers.js";

describe("habits", () => {
  let app: App;
  beforeEach(() => {
    ({ app } = setup());
  });

  describe("POST /habits", () => {
    it("creates a habit: 201, Location, trimmed name, default description, clock time", async () => {
      const res = await as(app, ALICE).post("/habits").send({ name: "  Meditate  " });
      expect(res.status).toBe(201);
      expect(res.headers.location).toBe(`/habits/${res.body.data.id}`);
      expect(res.body.data).toEqual({
        id: expect.any(String),
        name: "Meditate",
        description: "",
        createdAt: "2026-03-10T09:00:00.000Z",
      });
    });

    it("stores an optional description", async () => {
      const habit = await createHabit(app, ALICE, { name: "Run", description: "5k, slow is fine" });
      expect(habit.description).toBe("5k, slow is fine");
    });

    it.each([
      ["missing name", {}],
      ["blank name", { name: "   " }],
      ["non-string name", { name: 7 }],
      ["name over 60 chars", { name: "x".repeat(61) }],
      ["description over 280 chars", { name: "ok", description: "d".repeat(281) }],
      ["non-string description", { name: "ok", description: false }],
    ])("rejects %s with 400 VALIDATION_ERROR and field details", async (_label, body) => {
      const res = await as(app, ALICE).post("/habits").send(body);
      expect(res.status, JSON.stringify(res.body)).toBe(400);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
      expect(res.body.error.details).toEqual(
        expect.arrayContaining([expect.objectContaining({ path: expect.any(String), message: expect.any(String) })]),
      );
    });

    it("reports the failing field's path in details", async () => {
      const res = await as(app, ALICE).post("/habits").send({ name: "" });
      expect(res.body.error.details[0].path).toBe("name");
    });

    it("rejects a duplicate name for the same user (case-insensitive) with 409 HABIT_NAME_TAKEN", async () => {
      await createHabit(app, ALICE, { name: "Meditate" });
      const res = await as(app, ALICE).post("/habits").send({ name: " meditate " });
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe("HABIT_NAME_TAKEN");
    });

    it("allows different users to use the same name", async () => {
      await createHabit(app, ALICE, { name: "Meditate" });
      await createHabit(app, BOB, { name: "Meditate" });
    });
  });

  describe("GET /habits", () => {
    it("lists only the caller's habits, oldest first", async () => {
      await createHabit(app, ALICE, { name: "First" });
      await createHabit(app, BOB, { name: "Bob's" });
      await createHabit(app, ALICE, { name: "Second" });
      const res = await as(app, ALICE).get("/habits");
      expect(res.status).toBe(200);
      expect(res.body.data.map((h: { name: string }) => h.name)).toEqual(["First", "Second"]);
    });

    it("returns an empty list for a new user", async () => {
      const res = await as(app, "newbie").get("/habits");
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ data: [] });
    });
  });

  describe("GET /habits/:id", () => {
    it("returns the caller's habit", async () => {
      const habit = await createHabit(app, ALICE);
      const res = await as(app, ALICE).get(`/habits/${habit.id}`);
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual(habit);
    });

    it("hides other users' habits behind 404 HABIT_NOT_FOUND", async () => {
      const habit = await createHabit(app, ALICE);
      const res = await as(app, BOB).get(`/habits/${habit.id}`);
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe("HABIT_NOT_FOUND");
    });

    it("returns 404 HABIT_NOT_FOUND for an unknown id", async () => {
      const res = await as(app, ALICE).get("/habits/does-not-exist");
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe("HABIT_NOT_FOUND");
    });
  });

  describe("PATCH /habits/:id", () => {
    it("updates only the provided fields", async () => {
      const habit = await createHabit(app, ALICE, { name: "Run", description: "5k" });
      const res = await as(app, ALICE).patch(`/habits/${habit.id}`).send({ name: "Jog" });
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual({ ...habit, name: "Jog" });
    });

    it("rejects an empty patch with 400", async () => {
      const habit = await createHabit(app, ALICE);
      const res = await as(app, ALICE).patch(`/habits/${habit.id}`).send({});
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    });

    it("rejects renaming to another habit's name with 409", async () => {
      await createHabit(app, ALICE, { name: "Run" });
      const other = await createHabit(app, ALICE, { name: "Swim" });
      const res = await as(app, ALICE).patch(`/habits/${other.id}`).send({ name: "RUN" });
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe("HABIT_NAME_TAKEN");
    });

    it("allows changing only the capitalization of a habit's own name", async () => {
      const habit = await createHabit(app, ALICE, { name: "run" });
      const res = await as(app, ALICE).patch(`/habits/${habit.id}`).send({ name: "Run" });
      expect(res.status).toBe(200);
      expect(res.body.data.name).toBe("Run");
    });

    it("returns 404 for someone else's habit", async () => {
      const habit = await createHabit(app, ALICE);
      const res = await as(app, BOB).patch(`/habits/${habit.id}`).send({ name: "Mine now" });
      expect(res.status).toBe(404);
    });
  });

  describe("DELETE /habits/:id", () => {
    it("deletes the habit: 204 with no body, then 404", async () => {
      const habit = await createHabit(app, ALICE);
      const res = await as(app, ALICE).delete(`/habits/${habit.id}`);
      expect(res.status).toBe(204);
      expect(res.text).toBe("");
      expect((await as(app, ALICE).get(`/habits/${habit.id}`)).status).toBe(404);
    });

    it("frees the name for reuse", async () => {
      const habit = await createHabit(app, ALICE, { name: "Run" });
      await as(app, ALICE).delete(`/habits/${habit.id}`).expect(204);
      await createHabit(app, ALICE, { name: "Run" });
    });

    it("returns 404 for someone else's habit and leaves it alone", async () => {
      const habit = await createHabit(app, ALICE);
      expect((await as(app, BOB).delete(`/habits/${habit.id}`)).status).toBe(404);
      expect((await as(app, ALICE).get(`/habits/${habit.id}`)).status).toBe(200);
    });
  });
});
