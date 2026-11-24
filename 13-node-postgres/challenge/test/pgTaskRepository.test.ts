import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type pg from "pg";
import { PgTaskRepository, toProject, toTask } from "../src/repositories/pgTaskRepository.js";
import { describeTaskRepositoryContract } from "./contract/taskRepository.contract.js";
import { applySchema, countRows, createTestPool, truncateAll } from "./helpers/db.js";

let pool: pg.Pool;

beforeAll(async () => {
  pool = createTestPool();
  await applySchema(pool);
});

afterAll(async () => {
  await pool?.end();
});

describe("row mapping (TODO 1)", () => {
  it("maps a task row to a domain Task", () => {
    const created = new Date("2026-05-01T10:00:00Z");
    const task = toTask({
      id: "9007199254740993", // bigger than Number.MAX_SAFE_INTEGER: must stay a string
      project_id: "7",
      title: "Map me",
      status: "in_progress",
      estimate_hours: "2.50",
      due_date: "2026-12-31",
      created_at: created,
      updated_at: created,
    });
    expect(task).toEqual({
      id: "9007199254740993",
      projectId: "7",
      title: "Map me",
      status: "in_progress",
      estimateHours: 2.5,
      dueDate: "2026-12-31",
      createdAt: created,
      updatedAt: created,
    });
  });

  it("keeps nulls as null (not 0, not undefined)", () => {
    const now = new Date();
    const task = toTask({
      id: "1",
      project_id: "1",
      title: "Nulls",
      status: "todo",
      estimate_hours: null,
      due_date: null,
      created_at: now,
      updated_at: now,
    });
    expect(task.estimateHours).toBeNull();
    expect(task.dueDate).toBeNull();
  });

  it("maps a project row", () => {
    const now = new Date();
    expect(toProject({ id: "3", name: "P", created_at: now })).toEqual({ id: "3", name: "P", createdAt: now });
  });
});

// TODO 2 + 4: the same contract as the in-memory repository.
describeTaskRepositoryContract("PgTaskRepository", async () => {
  await truncateAll(pool);
  return new PgTaskRepository(pool);
});

describe("PgTaskRepository: Postgres-specific behaviour", () => {
  let repo: PgTaskRepository;
  beforeEach(async () => {
    await truncateAll(pool);
    repo = new PgTaskRepository(pool);
  });

  it("is immune to SQL injection (values are parameters, never SQL)", async () => {
    const project = await repo.createProject({ name: "Bobby" });
    const evil = "Robert'); DROP TABLE tasks; --";
    const task = await repo.createTask({ projectId: project.id, title: evil });
    expect(task.title).toBe(evil);
    expect(await countRows(pool, "tasks"), "the tasks table must still exist").toBe(1);
    expect(await repo.listTasks({ search: "' OR '1'='1" })).toEqual([]);
  });

  it("really uses a transaction: other connections can't see uncommitted rows", async () => {
    const project = await repo.createProject({ name: "Isolation" });
    let seenFromOutside = -1;
    await repo.transaction(async (tx) => {
      await tx.createTask({ projectId: project.id, title: "uncommitted" });
      // pool.query runs on a different connection, outside the transaction.
      seenFromOutside = await countRows(pool, "tasks");
    });
    expect(seenFromOutside, "a row written in the transaction leaked before COMMIT").toBe(0);
    expect(await countRows(pool, "tasks")).toBe(1);
  });

  it("does not leak connections when transactions fail", async () => {
    const tiny = createTestPool({ max: 2, connectionTimeoutMillis: 1_500 });
    try {
      const tinyRepo = new PgTaskRepository(tiny);
      const project = await tinyRepo.createProject({ name: "Leaky?" });
      for (let i = 0; i < 5; i++) {
        await expect(
          tinyRepo.transaction(async (tx) => {
            await tx.createTask({ projectId: project.id, title: `fail ${i}` });
            throw new Error(`fail ${i}`);
          }),
        ).rejects.toThrow(`fail ${i}`);
      }
      // With a leak, the pool (max 2) would be exhausted by now and this would time out.
      expect(await tinyRepo.listTasks({ projectId: project.id })).toEqual([]);
      expect(tiny.idleCount, "every checked-out client must be released").toBe(tiny.totalCount);
    } finally {
      await tiny.end();
    }
  });
});
