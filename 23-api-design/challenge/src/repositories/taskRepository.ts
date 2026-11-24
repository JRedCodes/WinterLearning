import { randomUUID } from "node:crypto";
import type { NewTask, Task, TaskPatch, TaskSort, TaskStatus } from "../domain/task.js";

/**
 * A position in a list ordered by (createdAt, id). The id breaks ties when two
 * rows share a timestamp, which makes the order total and the cursor stable.
 */
export interface KeysetPosition {
  createdAt: string;
  id: string;
}

export interface TaskListOptions {
  status?: TaskStatus;
  sort: TaskSort;
  /** Return only rows strictly AFTER this position in the requested sort order. */
  after?: KeysetPosition;
  limit: number;
}

export interface TaskRepository {
  create(projectId: string, input: NewTask, now: Date): Promise<Task>;
  findById(id: string): Promise<Task | null>;
  /**
   * The in-memory equivalent of
   *   SELECT * FROM tasks
   *    WHERE project_id = $1 [AND status = $2]
   *      [AND (created_at, id) > ($3, $4)]        -- or < for -createdAt
   *    ORDER BY created_at, id [DESC]
   *    LIMIT $5
   */
  listByProject(projectId: string, opts: TaskListOptions): Promise<Task[]>;
  /**
   * Compare-and-set: applies the patch only if the stored version is still
   * `expectedVersion`, bumping version and updatedAt. Returns null if the task
   * is missing or the version moved on. (SQL: UPDATE ... WHERE id = $1 AND version = $2)
   */
  updateIfVersion(id: string, expectedVersion: number, patch: TaskPatch, now: Date): Promise<Task | null>;
  delete(id: string): Promise<boolean>;
}

export class InMemoryTaskRepository implements TaskRepository {
  private readonly rows = new Map<string, Task>();

  async create(projectId: string, input: NewTask, now: Date): Promise<Task> {
    const ts = now.toISOString();
    const task: Task = { id: randomUUID(), projectId, ...input, createdAt: ts, updatedAt: ts, version: 1 };
    this.rows.set(task.id, task);
    return { ...task };
  }

  async findById(id: string): Promise<Task | null> {
    const t = this.rows.get(id);
    return t ? { ...t } : null;
  }

  async listByProject(projectId: string, { status, sort, after, limit }: TaskListOptions): Promise<Task[]> {
    const dir = sort === "-createdAt" ? -1 : 1;
    return [...this.rows.values()]
      .filter((t) => t.projectId === projectId && (!status || t.status === status))
      .sort((a, b) => dir * compareAsc(a, b))
      .filter((t) => !after || dir * compareAsc(t, after) > 0)
      .slice(0, limit)
      .map((t) => ({ ...t }));
  }

  async updateIfVersion(id: string, expectedVersion: number, patch: TaskPatch, now: Date): Promise<Task | null> {
    const current = this.rows.get(id);
    if (!current || current.version !== expectedVersion) return null;
    const defined = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)) as TaskPatch;
    const next: Task = { ...current, ...defined, updatedAt: now.toISOString(), version: current.version + 1 };
    this.rows.set(id, next);
    return { ...next };
  }

  async delete(id: string): Promise<boolean> {
    return this.rows.delete(id);
  }
}

function compareAsc(a: KeysetPosition, b: KeysetPosition): number {
  return a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}
