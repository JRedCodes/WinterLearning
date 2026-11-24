/**
 * Domain types. These are what the rest of the app talks in: camelCase,
 * real numbers, real Dates. No database column names leak past the
 * repository layer.
 */
export const TASK_STATUSES = ["todo", "in_progress", "done"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export interface Project {
  id: string; // bigint in Postgres: kept as a string so no precision is lost
  name: string;
  createdAt: Date;
}

export interface NewProject {
  name: string;
}

export interface Task {
  id: string;
  projectId: string;
  title: string;
  status: TaskStatus;
  estimateHours: number | null;
  dueDate: string | null; // calendar date, always "YYYY-MM-DD"
  createdAt: Date;
  updatedAt: Date;
}

export interface NewTask {
  projectId: string;
  title: string;
  status?: TaskStatus;
  estimateHours?: number | null;
  dueDate?: string | null;
}

/**
 * Fields that may change. `undefined` (or absent) means "leave as is";
 * `null` means "clear it" for nullable columns.
 */
export interface TaskPatch {
  projectId?: string;
  title?: string;
  status?: TaskStatus;
  estimateHours?: number | null;
  dueDate?: string | null;
}

export interface TaskFilter {
  projectId?: string;
  status?: TaskStatus;
  /** Case-insensitive substring match on the title. Characters are literal (no wildcards). */
  search?: string;
  /** Max rows to return. Repositories default to 50. */
  limit?: number;
}
