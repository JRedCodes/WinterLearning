export const TASK_STATUSES = ["todo", "in_progress", "done"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_PRIORITIES = ["low", "medium", "high"] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export interface Task {
  id: string;
  projectId: string;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  /** Calendar date "YYYY-MM-DD" or null. */
  dueDate: string | null;
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
  /** Increments on every change. Basis of the ETag. */
  version: number;
}

export interface NewTask {
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate: string | null;
}

/** JSON Merge Patch semantics: absent = unchanged, null dueDate = clear it. */
export type TaskPatch = Partial<NewTask>;

export const TASK_SORTS = ["createdAt", "-createdAt"] as const;
export type TaskSort = (typeof TASK_SORTS)[number];

export interface TaskListQuery {
  limit: number;
  cursor?: string;
  status?: TaskStatus;
  sort: TaskSort;
}
