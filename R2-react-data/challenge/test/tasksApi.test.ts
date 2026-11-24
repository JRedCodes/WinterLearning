import { describe, expect, it } from "vitest";
import { createApiClient } from "../src/api/client";
import { ApiError } from "../src/api/errors";
import { createTasksApi } from "../src/api/tasks";
import { API_URL, PROJECT_ID, installFakeApi, makeTask } from "./helpers/fakeApi";

const api = () => createTasksApi(createApiClient({ baseUrl: API_URL }));

describe("createTasksApi (TODO 2)", () => {
  it("list: GETs one page of a project's tasks with limit and cursor", async () => {
    const fake = installFakeApi([makeTask(), makeTask(), makeTask()]);
    const first = await api().list({ projectId: PROJECT_ID, limit: 2 });
    expect(first.data).toHaveLength(2);
    expect(first.page.nextCursor).toEqual(expect.any(String));

    const second = await api().list({ projectId: PROJECT_ID, limit: 2, cursor: first.page.nextCursor });
    expect(second.data).toHaveLength(1);
    expect(second.page.nextCursor).toBeNull();

    const [req1, req2] = fake.requestsTo("GET", `/v1/projects/${PROJECT_ID}/tasks`);
    expect(req1?.url.searchParams.has("cursor"), "no cursor on the first page").toBe(false);
    expect(req2?.url.searchParams.get("cursor")).toBe(first.page.nextCursor);
  });

  it("list: passes the status filter", async () => {
    const fake = installFakeApi([makeTask({ status: "done" }), makeTask()]);
    const page = await api().list({ projectId: PROJECT_ID, status: "done" });
    expect(page.data.map((t) => t.status)).toEqual(["done"]);
    expect(fake.requests[0]?.url.searchParams.get("status")).toBe("done");
  });

  it("create: POSTs the input with an Idempotency-Key header and returns the created task", async () => {
    const fake = installFakeApi();
    const task = await api().create(PROJECT_ID, { title: "Write docs", priority: "high", dueDate: "2026-12-01" }, "key-123");
    expect(task).toMatchObject({ title: "Write docs", priority: "high", dueDate: "2026-12-01", projectId: PROJECT_ID });
    const [req] = fake.requestsTo("POST", `/v1/projects/${PROJECT_ID}/tasks`);
    expect(req?.headers.get("idempotency-key")).toBe("key-123");
    expect(req?.body).toEqual({ title: "Write docs", priority: "high", dueDate: "2026-12-01" });
  });

  it('update: PATCHes /v1/tasks/:id with If-Match: "<version>" and returns the new version', async () => {
    const existing = makeTask({ version: 3 });
    const fake = installFakeApi([existing]);
    const updated = await api().update(existing, { status: "done" });
    expect(updated).toMatchObject({ id: existing.id, status: "done", version: 4 });
    const [req] = fake.requestsTo("PATCH", `/v1/tasks/${existing.id}`);
    expect(req?.headers.get("if-match")).toBe('"3"');
    expect(req?.body).toEqual({ status: "done" });
  });

  it("update: a stale version surfaces as a 412 ApiError with isConflict", async () => {
    const existing = makeTask({ version: 3 });
    installFakeApi([{ ...existing, version: 4 }]); // someone else updated it
    const error = await api().update(existing, { status: "done" }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).isConflict).toBe(true);
  });
});
