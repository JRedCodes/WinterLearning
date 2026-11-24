import { vi } from "vitest";
import type { Task } from "../../src/schemas/task";

/**
 * An in-memory fake of module 23's tasks API, installed as the global fetch.
 * It speaks the real contract (paths, cursor pages, Idempotency-Key, If-Match,
 * problem+json errors) so the code under test can't tell the difference.
 */

export const API_URL = "http://api.test";
export const PROJECT_ID = "proj-1";

export interface RecordedRequest {
  method: string;
  url: URL;
  path: string;
  headers: Headers;
  body: unknown;
}

type Handler = (req: RecordedRequest) => Response | Promise<Response>;

export function json(status: number, body: unknown, contentType = "application/json"): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": contentType } });
}

export function problem(status: number, title: string, detail: string, errors?: { pointer: string; detail: string }[]): Response {
  return json(
    status,
    { type: `https://api.wl.example/problems/${title.toLowerCase().replace(/ /g, "-")}`, title, status, detail, ...(errors ? { errors } : {}) },
    "application/problem+json",
  );
}

let seq = 0;
export function makeTask(overrides: Partial<Task> = {}): Task {
  seq += 1;
  const createdAt = new Date(Date.UTC(2026, 0, 1, 0, seq)).toISOString();
  return {
    id: `task-${seq}`,
    projectId: PROJECT_ID,
    title: `Task ${seq}`,
    status: "todo",
    priority: "medium",
    dueDate: null,
    createdAt,
    updatedAt: createdAt,
    version: 1,
    ...overrides,
  };
}

const encodeCursor = (offset: number) => btoa(JSON.stringify({ offset }));
const decodeCursor = (cursor: string) => (JSON.parse(atob(cursor)) as { offset: number }).offset;

export interface FakeApi {
  /** Server-side state, newest first. Tests may edit it to simulate other users. */
  tasks: Task[];
  requests: RecordedRequest[];
  /** Requests matching method + path prefix. */
  requestsTo(method: string, pathPrefix: string): RecordedRequest[];
  /** The next matching request gets this response instead of the normal one. */
  failNext(method: string, pathPrefix: string, response: () => Response | Promise<Response>): void;
  /** The next matching request waits until you call the returned release(). */
  holdNext(method: string, pathPrefix: string): () => void;
  fetch: ReturnType<typeof vi.fn>;
}

export function installFakeApi(initial: Task[] = []): FakeApi {
  const tasks = [...initial];
  const requests: RecordedRequest[] = [];
  const overrides: { method: string; prefix: string; handler: Handler }[] = [];

  function takeOverride(req: RecordedRequest): Handler | undefined {
    const index = overrides.findIndex((o) => o.method === req.method && req.path.startsWith(o.prefix));
    if (index === -1) return undefined;
    const [override] = overrides.splice(index, 1);
    return override?.handler;
  }

  function route(req: RecordedRequest): Response {
    const list = req.path.match(/^\/v1\/projects\/([^/]+)\/tasks$/);
    if (list && req.method === "GET") {
      const limit = Number(req.url.searchParams.get("limit") ?? 20);
      const cursor = req.url.searchParams.get("cursor");
      const status = req.url.searchParams.get("status");
      const matching = tasks.filter((t) => t.projectId === list[1] && (!status || t.status === status));
      const offset = cursor ? decodeCursor(cursor) : 0;
      const data = matching.slice(offset, offset + limit);
      const nextCursor = offset + limit < matching.length ? encodeCursor(offset + limit) : null;
      return json(200, { data, page: { limit, nextCursor } });
    }

    if (list && req.method === "POST") {
      if (!req.headers.get("idempotency-key")) {
        return problem(400, "Validation Failed", "Idempotency-Key header is required");
      }
      const body = req.body as { title?: unknown; priority?: unknown; dueDate?: unknown };
      if (typeof body?.title !== "string" || body.title.trim() === "") {
        return problem(400, "Validation Failed", "Request validation failed", [{ pointer: "/title", detail: "Title is required" }]);
      }
      if (tasks.some((t) => t.title.toLowerCase() === String(body.title).toLowerCase())) {
        return problem(400, "Validation Failed", "Request validation failed", [
          { pointer: "/title", detail: "Title must be unique in this project" },
        ]);
      }
      const task = makeTask({
        projectId: list[1],
        title: body.title,
        priority: (body.priority as Task["priority"]) ?? "medium",
        dueDate: (body.dueDate as string | null) ?? null,
      });
      tasks.unshift(task); // newest first
      return json(201, task);
    }

    const one = req.path.match(/^\/v1\/tasks\/([^/]+)$/);
    if (one && req.method === "PATCH") {
      const index = tasks.findIndex((t) => t.id === one[1]);
      const current = tasks[index];
      if (!current) return problem(404, "Not Found", "Task not found");
      const ifMatch = req.headers.get("if-match");
      if (!ifMatch) return problem(428, "Precondition Required", "If-Match header is required");
      if (ifMatch !== `"${current.version}"`) {
        return problem(412, "Precondition Failed", "Task has been modified since you last read it");
      }
      const updated: Task = { ...current, ...(req.body as object), version: current.version + 1, updatedAt: new Date().toISOString() };
      tasks[index] = updated;
      return json(200, updated);
    }

    return problem(404, "Not Found", `No route for ${req.method} ${req.path}`);
  }

  const fetchMock = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
    if (url.origin !== API_URL) throw new TypeError(`fake API: unexpected origin ${url.origin} (expected ${API_URL})`);
    const req: RecordedRequest = {
      method: (init.method ?? "GET").toUpperCase(),
      url,
      path: url.pathname,
      headers: new Headers(init.headers),
      body: typeof init.body === "string" ? JSON.parse(init.body) : undefined,
    };
    requests.push(req);
    const override = takeOverride(req);
    return override ? override(req) : route(req);
  });

  vi.stubGlobal("fetch", fetchMock);

  return {
    tasks,
    requests,
    requestsTo: (method, prefix) => requests.filter((r) => r.method === method && r.path.startsWith(prefix)),
    failNext(method, prefix, response) {
      overrides.push({ method, prefix, handler: () => response() });
    },
    holdNext(method, prefix) {
      let release!: () => void;
      const gate = new Promise<void>((resolve) => (release = resolve));
      overrides.push({
        method,
        prefix,
        handler: async (req) => {
          await gate;
          return route(req);
        },
      });
      return release;
    },
    fetch: fetchMock,
  };
}
