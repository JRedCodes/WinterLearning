import { beforeEach, describe, expect, it } from "vitest";
import { ALICE, BOB, as, checkIn, createHabit, setup, type App, type TestClock } from "./helpers.js";

describe("check-ins", () => {
  let app: App;
  let clock: TestClock;
  let habitId: string;

  beforeEach(async () => {
    ({ app, clock } = setup("2026-03-10T09:00:00.000Z"));
    habitId = (await createHabit(app, ALICE)).id;
  });

  describe("PUT /habits/:id/check-ins/:date", () => {
    it("records a check-in for today with 201", async () => {
      const res = await as(app, ALICE).put(`/habits/${habitId}/check-ins/2026-03-10`);
      expect(res.status).toBe(201);
      expect(res.body.data).toEqual({ date: "2026-03-10" });
    });

    it("is idempotent: checking in twice for the same day returns 200 and keeps one check-in", async () => {
      await as(app, ALICE).put(`/habits/${habitId}/check-ins/2026-03-09`).expect(201);
      const again = await as(app, ALICE).put(`/habits/${habitId}/check-ins/2026-03-09`);
      expect(again.status).toBe(200);
      expect(again.body.data).toEqual({ date: "2026-03-09" });
      const list = await as(app, ALICE).get(`/habits/${habitId}/check-ins`);
      expect(list.body.data).toEqual([{ date: "2026-03-09" }]);
    });

    it("allows back-filling past days", async () => {
      const res = await as(app, ALICE).put(`/habits/${habitId}/check-ins/2025-12-31`);
      expect(res.status).toBe(201);
    });

    it("rejects a future date (in UTC, per the clock) with 422 FUTURE_DATE", async () => {
      const res = await as(app, ALICE).put(`/habits/${habitId}/check-ins/2026-03-11`);
      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe("FUTURE_DATE");
    });

    it("uses UTC to decide what 'today' is", async () => {
      clock.set("2026-03-10T23:59:59.999Z");
      expect((await as(app, ALICE).put(`/habits/${habitId}/check-ins/2026-03-11`)).status).toBe(422);
      clock.set("2026-03-11T00:00:00.000Z");
      expect((await as(app, ALICE).put(`/habits/${habitId}/check-ins/2026-03-11`)).status).toBe(201);
    });

    it.each(["2026-3-10", "20260310", "2026-02-30", "2026-13-01", "yesterday", "2026-03-10T00:00:00Z"])(
      "rejects the invalid date %s with 400 VALIDATION_ERROR",
      async (date) => {
        const res = await as(app, ALICE).put(`/habits/${habitId}/check-ins/${date}`);
        expect(res.status, JSON.stringify(res.body)).toBe(400);
        expect(res.body.error.code).toBe("VALIDATION_ERROR");
      },
    );

    it("accepts 29 February in a leap year", async () => {
      ({ app, clock } = setup("2028-03-01T12:00:00.000Z"));
      const id = (await createHabit(app, ALICE)).id;
      expect((await as(app, ALICE).put(`/habits/${id}/check-ins/2028-02-29`)).status).toBe(201);
      expect((await as(app, ALICE).put(`/habits/${id}/check-ins/2027-02-29`)).status).toBe(400);
    });

    it("returns 404 HABIT_NOT_FOUND for someone else's habit", async () => {
      const res = await as(app, BOB).put(`/habits/${habitId}/check-ins/2026-03-10`);
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe("HABIT_NOT_FOUND");
    });
  });

  describe("GET /habits/:id/check-ins", () => {
    beforeEach(async () => {
      for (const d of ["2026-03-05", "2026-02-27", "2026-03-01", "2026-03-10"]) await checkIn(app, ALICE, habitId, d);
    });

    it("lists check-ins in ascending date order", async () => {
      const res = await as(app, ALICE).get(`/habits/${habitId}/check-ins`);
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([
        { date: "2026-02-27" },
        { date: "2026-03-01" },
        { date: "2026-03-05" },
        { date: "2026-03-10" },
      ]);
    });

    it("filters by an inclusive ?from= / ?to= range", async () => {
      const res = await as(app, ALICE).get(`/habits/${habitId}/check-ins`).query({ from: "2026-03-01", to: "2026-03-05" });
      expect(res.body.data).toEqual([{ date: "2026-03-01" }, { date: "2026-03-05" }]);
      const onlyFrom = await as(app, ALICE).get(`/habits/${habitId}/check-ins`).query({ from: "2026-03-02" });
      expect(onlyFrom.body.data).toEqual([{ date: "2026-03-05" }, { date: "2026-03-10" }]);
    });

    it("rejects an invalid range with 400", async () => {
      const backwards = await as(app, ALICE).get(`/habits/${habitId}/check-ins`).query({ from: "2026-03-05", to: "2026-03-01" });
      expect(backwards.status).toBe(400);
      expect(backwards.body.error.code).toBe("VALIDATION_ERROR");
      const garbage = await as(app, ALICE).get(`/habits/${habitId}/check-ins`).query({ from: "last week" });
      expect(garbage.status).toBe(400);
    });

    it("keeps check-ins separate per habit", async () => {
      const other = await createHabit(app, ALICE, { name: "Other" });
      const res = await as(app, ALICE).get(`/habits/${other.id}/check-ins`);
      expect(res.body.data).toEqual([]);
    });
  });

  describe("DELETE /habits/:id/check-ins/:date", () => {
    it("removes a check-in: 204, then it's gone", async () => {
      await checkIn(app, ALICE, habitId, "2026-03-08");
      const res = await as(app, ALICE).delete(`/habits/${habitId}/check-ins/2026-03-08`);
      expect(res.status).toBe(204);
      expect((await as(app, ALICE).get(`/habits/${habitId}/check-ins`)).body.data).toEqual([]);
    });

    it("returns 404 CHECK_IN_NOT_FOUND when there's nothing to remove", async () => {
      const res = await as(app, ALICE).delete(`/habits/${habitId}/check-ins/2026-03-08`);
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe("CHECK_IN_NOT_FOUND");
    });
  });

  it("deleting a habit deletes its check-ins", async () => {
    await checkIn(app, ALICE, habitId, "2026-03-10");
    await as(app, ALICE).delete(`/habits/${habitId}`).expect(204);
    const res = await as(app, ALICE).get(`/habits/${habitId}/check-ins`);
    expect(res.status).toBe(404);
  });
});
