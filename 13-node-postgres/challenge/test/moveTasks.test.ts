import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type pg from "pg";
import { ProjectNotFoundError, TaskNotFoundError } from "../src/domain/errors.js";
import type { Project, Task } from "../src/domain/task.js";
import { PgTaskRepository } from "../src/repositories/pgTaskRepository.js";
import { TaskService } from "../src/services/taskService.js";
import { applySchema, createTestPool, truncateAll } from "./helpers/db.js";

/**
 * The unchanged TaskService running on YOUR PgTaskRepository.
 * moveTasks updates several rows; a failure half-way must undo the earlier
 * updates. Only a real transaction (TODO 3 + 4) gets this right.
 */
let pool: pg.Pool;
let service: TaskService;
let from: Project;
let to: Project;
let tasks: Task[];

async function projectOf(id: string): Promise<string | undefined> {
  const { rows } = await pool.query<{ project_id: string }>("SELECT project_id FROM tasks WHERE id = $1", [id]);
  return rows[0]?.project_id;
}

beforeAll(async () => {
  pool = createTestPool();
  await applySchema(pool);
  // A trigger that fails when the task titled 'poison' is moved: a stand-in for
  // any mid-way failure (constraint, deadlock, network blip, ...).
  await pool.query(`
    CREATE FUNCTION fail_on_poison() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF NEW.title = 'poison' AND NEW.project_id <> OLD.project_id THEN
        RAISE EXCEPTION 'injected failure while moving %', NEW.id;
      END IF;
      RETURN NEW;
    END $$;
    CREATE TRIGGER tasks_fail_on_poison BEFORE UPDATE ON tasks
      FOR EACH ROW EXECUTE FUNCTION fail_on_poison();
  `);
});

afterAll(async () => {
  await pool?.end();
});

beforeEach(async () => {
  await truncateAll(pool);
  service = new TaskService(new PgTaskRepository(pool));
  from = await service.createProject("From");
  to = await service.createProject("To");
  tasks = [];
  for (const title of ["first", "poison", "third"]) {
    tasks.push(await service.createTask({ projectId: from.id, title }));
  }
});

describe("TaskService.moveTasks on Postgres (TODO 3 + 4)", () => {
  it("moves all tasks when everything succeeds", async () => {
    const [first, , third] = tasks;
    const moved = await service.moveTasks([first!.id, third!.id], to.id);
    expect(moved.map((t) => t.projectId)).toEqual([to.id, to.id]);
    expect(await projectOf(first!.id)).toBe(to.id);
    expect(await projectOf(third!.id)).toBe(to.id);
  });

  it("rolls back earlier moves when a task in the middle is missing", async () => {
    const [first, , third] = tasks;
    await expect(service.moveTasks([first!.id, "999999", third!.id], to.id)).rejects.toBeInstanceOf(
      TaskNotFoundError,
    );
    expect(await projectOf(first!.id), "'first' was moved before the failure and must be rolled back").toBe(
      from.id,
    );
    expect(await projectOf(third!.id)).toBe(from.id);
  });

  it("rolls back when the database fails half-way (injected trigger failure)", async () => {
    const ids = tasks.map((t) => t.id); // first, poison, third
    await expect(service.moveTasks(ids, to.id)).rejects.toThrow(/injected failure/);
    for (const id of ids) {
      expect(await projectOf(id), `task ${id} must still be in the original project`).toBe(from.id);
    }
  });

  it("rejects an unknown target project without moving anything", async () => {
    await expect(service.moveTasks([tasks[0]!.id], "999999")).rejects.toBeInstanceOf(ProjectNotFoundError);
    expect(await projectOf(tasks[0]!.id)).toBe(from.id);
  });
});
