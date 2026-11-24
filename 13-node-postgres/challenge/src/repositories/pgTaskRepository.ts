import type pg from "pg";
import type { Queryable } from "../db/pool.js";
import type { NewProject, NewTask, Project, Task, TaskFilter, TaskPatch } from "../domain/task.js";
import type { TaskRepository } from "./taskRepository.js";

/**
 * What node-postgres hands you for `SELECT * FROM tasks`. Don't take my word
 * for it: `console.log(result.rows[0])` once and look.
 *
 *   bigint      → string   (int8 can exceed Number.MAX_SAFE_INTEGER)
 *   numeric     → string   (exact decimals; JS numbers aren't)
 *   timestamptz → Date
 *   date        → Date at LOCAL midnight (a trap: see TODO 1)
 */
export interface TaskRow {
  id: string;
  project_id: string;
  title: string;
  status: string;
  estimate_hours: string | null;
  due_date: Date | string | null;
  created_at: Date;
  updated_at: Date;
}

export interface ProjectRow {
  id: string;
  name: string;
  created_at: Date;
}

/**
 * TODO(1): Row mapping
 *
 * Turn a database row into a domain object: snake_case → camelCase,
 * numeric string → number (or null), and due_date → "YYYY-MM-DD" (or null).
 *
 * Careful with due_date. If you let pg parse it, you get a Date at local
 * midnight, and `toISOString()` shifts it to UTC, which is the PREVIOUS day
 * anywhere east of Greenwich. The tests run with TZ=Pacific/Auckland on
 * purpose. Easiest fix: have Postgres format it for you in the SELECT
 * (e.g. `to_char(due_date, 'YYYY-MM-DD') AS due_date`).
 */
export function toTask(row: TaskRow): Task {
  void row;
  throw new Error("Not implemented: toTask (TODO 1)");
}

export function toProject(row: ProjectRow): Project {
  void row;
  throw new Error("Not implemented: toProject (TODO 1)");
}

/**
 * Postgres implementation of TaskRepository.
 *
 * `pool` is used to start transactions; `db` is what queries run on. Outside
 * a transaction they're the same object. Inside `transaction()`, create a new
 * PgTaskRepository whose `db` is the transaction's client.
 */
export class PgTaskRepository implements TaskRepository {
  constructor(
    private readonly pool: pg.Pool,
    private readonly db: Queryable = pool,
  ) {}

  // TODO(2): implement every method with parameterized SQL ($1, $2, ...).
  // Never build SQL by concatenating values: the tests try an injection.
  //  - createTask / updateTask: if Postgres rejects the project_id with a
  //    foreign-key violation (error code "23503"), throw ProjectNotFoundError.
  //  - listTasks: optional filters, ORDER BY created_at, id, default limit 50.
  //    `search` is a case-insensitive substring and characters like % and _
  //    must match literally (the in-memory version uses String#includes).
  //  - updateTask: only touch columns present in the patch; always bump
  //    updated_at. Column names must come from a fixed whitelist, never input.

  async createProject(input: NewProject): Promise<Project> {
    void input;
    throw new Error("Not implemented: createProject (TODO 2)");
  }

  async findProjectById(id: string): Promise<Project | null> {
    void id;
    throw new Error("Not implemented: findProjectById (TODO 2)");
  }

  async createTask(input: NewTask): Promise<Task> {
    void input;
    throw new Error("Not implemented: createTask (TODO 2)");
  }

  async findTaskById(id: string): Promise<Task | null> {
    void id;
    throw new Error("Not implemented: findTaskById (TODO 2)");
  }

  async listTasks(filter: TaskFilter = {}): Promise<Task[]> {
    void filter;
    throw new Error("Not implemented: listTasks (TODO 2)");
  }

  async updateTask(id: string, patch: TaskPatch): Promise<Task | null> {
    void id;
    void patch;
    throw new Error("Not implemented: updateTask (TODO 2)");
  }

  async deleteTask(id: string): Promise<boolean> {
    void id;
    throw new Error("Not implemented: deleteTask (TODO 2)");
  }

  /**
   * TODO(4): run `fn` inside a real transaction using withTransaction(),
   * passing it a PgTaskRepository bound to the transaction's client.
   * (Bonus: if this repository is already inside a transaction, just
   * call fn(this) so nested calls join the outer transaction.)
   */
  async transaction<T>(fn: (tx: TaskRepository) => Promise<T>): Promise<T> {
    void fn;
    void this.pool;
    void this.db;
    throw new Error("Not implemented: transaction (TODO 4)");
  }
}
