import request from "supertest";
import { expect } from "vitest";
import { createApp } from "../src/app.js";

export const ALICE = "alice";
export const BOB = "bob";

/** A clock the test controls. Starts on Tuesday 10 March 2026, 09:00 UTC. */
export class TestClock {
  #now: Date;
  constructor(start = "2026-03-10T09:00:00.000Z") {
    this.#now = new Date(start);
  }
  now(): Date {
    return new Date(this.#now);
  }
  set(iso: string): void {
    this.#now = new Date(iso);
  }
}

export function setup(start?: string) {
  const clock = new TestClock(start);
  const app = createApp({ clock });
  return { app, clock };
}

export type App = ReturnType<typeof createApp>;

export const as = (app: App, user: string) => ({
  get: (url: string) => request(app).get(url).set("X-User-Id", user),
  post: (url: string) => request(app).post(url).set("X-User-Id", user),
  put: (url: string) => request(app).put(url).set("X-User-Id", user),
  patch: (url: string) => request(app).patch(url).set("X-User-Id", user),
  delete: (url: string) => request(app).delete(url).set("X-User-Id", user),
});

export async function createHabit(app: App, user: string, body: object = { name: "Read 20 pages" }) {
  const res = await as(app, user).post("/habits").send(body);
  expect(res.status, `POST /habits failed: ${JSON.stringify(res.body)}`).toBe(201);
  return res.body.data as { id: string; name: string; description: string; createdAt: string };
}

export async function checkIn(app: App, user: string, habitId: string, date: string) {
  const res = await as(app, user).put(`/habits/${habitId}/check-ins/${date}`);
  expect([200, 201], `check-in ${date} failed: ${res.status} ${JSON.stringify(res.body)}`).toContain(res.status);
  return res;
}
