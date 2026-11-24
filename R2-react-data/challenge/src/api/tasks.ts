import type { NewTask, Task, TaskPage, TaskPatch, TaskStatus } from "../schemas/task";
import type { ApiClient } from "./client";

export interface ListTasksParams {
  projectId: string;
  /** Opaque cursor from the previous page's `page.nextCursor`. null/undefined = first page. */
  cursor?: string | null;
  limit?: number;
  status?: TaskStatus;
}

/** Everything the UI can do with tasks. Hooks depend on this interface, not on fetch. */
export interface TasksApi {
  list(params: ListTasksParams, signal?: AbortSignal): Promise<TaskPage>;
  create(projectId: string, input: NewTask, idempotencyKey: string): Promise<Task>;
  update(task: Pick<Task, "id" | "version">, patch: TaskPatch): Promise<Task>;
}

/**
 * TODO(2): the tasks endpoints, on top of the ApiClient (module 23's contract).
 *
 *  list    GET   /v1/projects/:projectId/tasks?limit=&cursor=&status=
 *          -> TaskPage (validate with TaskPageSchema). Pass `signal` on.
 *  create  POST  /v1/projects/:projectId/tasks
 *          body = input, header `Idempotency-Key: <idempotencyKey>`
 *          -> Task (TaskSchema)
 *  update  PATCH /v1/tasks/:taskId
 *          body = patch, header `If-Match: "<task.version>"` (WITH the double quotes)
 *          -> Task (TaskSchema)
 *
 * Use encodeURIComponent for ids in paths.
 */
export function createTasksApi(_client: ApiClient): TasksApi {
  const notImplemented = (): never => {
    throw new Error("Not implemented: TODO(2) TasksApi");
  };
  return { list: notImplemented, create: notImplemented, update: notImplemented };
}
