import request from "supertest";
import { expect } from "vitest";
import { createApp, type AppDeps } from "../../src/app.js";

export type App = ReturnType<typeof createApp>;

/** A clock that moves forward one second per call, so createdAt values are distinct and ordered. */
export function tickingClock(start = "2026-01-01T00:00:00.000Z") {
  let t = Date.parse(start);
  return () => new Date((t += 1000));
}

export function makeApp(deps: AppDeps = {}): App {
  return createApp({ clock: tickingClock(), ...deps });
}

export async function createProject(app: App, name = "Launch") {
  const res = await request(app).post("/v1/projects").send({ name });
  expect(res.status, `createProject failed: ${res.text}`).toBe(201);
  return res.body as { id: string; name: string };
}

export async function createTask(app: App, projectId: string, body: Record<string, unknown> = { title: "Write spec" }) {
  const res = await request(app).post(`/v1/projects/${projectId}/tasks`).send(body);
  expect(res.status, `createTask failed: ${res.text}`).toBe(201);
  return res.body as { id: string; title: string; status: string; version: number };
}

/** Follows nextCursor until the end and returns every page. */
export async function walkPages(app: App, firstUrl: string, maxPages = 50) {
  const pages: { data: { id: string }[]; page: { nextCursor: string | null; limit: number } }[] = [];
  let url: string | null = firstUrl;
  while (url && pages.length < maxPages) {
    const res = await request(app).get(url);
    expect(res.status, `GET ${url} failed: ${res.text}`).toBe(200);
    pages.push(res.body);
    const next: string | null = res.body.page?.nextCursor ?? null;
    url = next ? `${firstUrl}${firstUrl.includes("?") ? "&" : "?"}cursor=${encodeURIComponent(next)}` : null;
  }
  return pages;
}
