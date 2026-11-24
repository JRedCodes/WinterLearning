import type { NewTask, Task } from "../schemas/task";

const PREFIX = "optimistic-";

/** A placeholder task shown while the real one is being created. */
export function optimisticTask(projectId: string, input: NewTask, idempotencyKey: string): Task {
  const now = new Date().toISOString();
  return {
    id: `${PREFIX}${idempotencyKey}`,
    projectId,
    title: input.title,
    status: "todo",
    priority: input.priority,
    dueDate: input.dueDate,
    createdAt: now,
    updatedAt: now,
    version: 0,
  };
}

export function isOptimistic(task: Pick<Task, "id">): boolean {
  return task.id.startsWith(PREFIX);
}
