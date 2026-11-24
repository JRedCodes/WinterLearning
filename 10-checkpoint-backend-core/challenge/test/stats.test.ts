import { beforeEach, describe, expect, it } from "vitest";
import { ALICE, BOB, as, checkIn, createHabit, setup, type App, type TestClock } from "./helpers.js";

describe("GET /habits/:id/stats", () => {
  let app: App;
  let clock: TestClock;
  let habitId: string;

  beforeEach(async () => {
    ({ app, clock } = setup("2026-03-10T09:00:00.000Z"));
    habitId = (await createHabit(app, ALICE)).id;
  });

  async function stats(id = habitId) {
    const res = await as(app, ALICE).get(`/habits/${id}/stats`);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    return res.body.data as {
      currentStreak: number;
      longestStreak: number;
      totalCheckIns: number;
      checkInsLast30Days: number;
    };
  }

  async function checkInAll(dates: string[]) {
    for (const d of dates) await checkIn(app, ALICE, habitId, d);
  }

  it("is all zeros for a habit without check-ins", async () => {
    expect(await stats()).toEqual({ currentStreak: 0, longestStreak: 0, totalCheckIns: 0, checkInsLast30Days: 0 });
  });

  it("counts a streak that includes today", async () => {
    await checkInAll(["2026-03-08", "2026-03-09", "2026-03-10"]);
    expect(await stats()).toMatchObject({ currentStreak: 3, longestStreak: 3, totalCheckIns: 3 });
  });

  it("keeps the streak alive if today isn't checked in yet but yesterday is", async () => {
    await checkInAll(["2026-03-07", "2026-03-08", "2026-03-09"]);
    expect((await stats()).currentStreak).toBe(3);
  });

  it("resets the current streak after a missed day", async () => {
    await checkInAll(["2026-03-05", "2026-03-06", "2026-03-07", "2026-03-08"]);
    // nothing on the 9th or the 10th
    expect(await stats()).toMatchObject({ currentStreak: 0, longestStreak: 4 });
  });

  it("finds the longest streak anywhere in the history", async () => {
    await checkInAll([
      "2026-01-01", "2026-01-02",
      "2026-02-10", "2026-02-11", "2026-02-12", "2026-02-13", "2026-02-14",
      "2026-03-09", "2026-03-10",
    ]);
    expect(await stats()).toMatchObject({ currentStreak: 2, longestStreak: 5, totalCheckIns: 9 });
  });

  it("counts streaks across month and year boundaries", async () => {
    ({ app, clock } = setup("2026-01-02T08:00:00.000Z"));
    habitId = (await createHabit(app, ALICE)).id;
    await checkInAll(["2025-12-30", "2025-12-31", "2026-01-01", "2026-01-02"]);
    expect(await stats()).toMatchObject({ currentStreak: 4, longestStreak: 4 });
  });

  it("counts check-ins in the last 30 days, today included", async () => {
    // window for 2026-03-10 is 2026-02-09 .. 2026-03-10
    await checkInAll(["2026-02-08", "2026-02-09", "2026-02-20", "2026-03-10"]);
    expect(await stats()).toMatchObject({ totalCheckIns: 4, checkInsLast30Days: 3 });
  });

  it("follows the clock: stats change as days pass", async () => {
    await checkInAll(["2026-03-09", "2026-03-10"]);
    expect((await stats()).currentStreak).toBe(2);
    clock.set("2026-03-11T12:00:00.000Z");
    expect((await stats()).currentStreak).toBe(2); // yesterday still counts
    clock.set("2026-03-12T00:00:00.000Z");
    expect(await stats()).toMatchObject({ currentStreak: 0, longestStreak: 2 });
  });

  it("returns 404 for someone else's habit", async () => {
    const res = await as(app, BOB).get(`/habits/${habitId}/stats`);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("HABIT_NOT_FOUND");
  });
});
