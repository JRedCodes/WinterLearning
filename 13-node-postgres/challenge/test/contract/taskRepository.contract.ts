import { beforeEach, describe, expect, it } from "vitest";
import { ProjectNotFoundError } from "../../src/domain/errors.js";
import type { Project } from "../../src/domain/task.js";
import type { TaskRepository } from "../../src/repositories/taskRepository.js";

/**
 * The TaskRepository contract. Every implementation must pass ALL of these.
 * The same suite runs against InMemoryTaskRepository (already passing) and
 * PgTaskRepository (yours). If they behave differently, the service layer
 * would behave differently in tests and production, which is what this
 * suite exists to prevent.
 */
export function describeTaskRepositoryContract(
  name: string,
  makeRepo: () => Promise<TaskRepository>,
): void {
  describe(`${name} (TaskRepository contract)`, () => {
    let repo: TaskRepository;
    let project: Project;

    beforeEach(async () => {
      repo = await makeRepo();
      project = await repo.createProject({ name: "Inbox" });
    });

    describe("projects", () => {
      it("creates and finds a project", async () => {
        expect(typeof project.id, "ids are strings (bigint-safe)").toBe("string");
        expect(project.name).toBe("Inbox");
        expect(project.createdAt).toBeInstanceOf(Date);
        expect(await repo.findProjectById(project.id)).toEqual(project);
      });

      it("returns null for a missing project", async () => {
        expect(await repo.findProjectById("999999")).toBeNull();
      });
    });

    describe("createTask / findTaskById", () => {
      it("applies defaults", async () => {
        const task = await repo.createTask({ projectId: project.id, title: "Write tests" });
        expect(task).toMatchObject({
          projectId: project.id,
          title: "Write tests",
          status: "todo",
          estimateHours: null,
          dueDate: null,
        });
        expect(typeof task.id).toBe("string");
        expect(task.createdAt).toBeInstanceOf(Date);
        expect(task.updatedAt).toBeInstanceOf(Date);
      });

      it("maps every field with the right JS type and round-trips it", async () => {
        const created = await repo.createTask({
          projectId: project.id,
          title: "Ship it",
          status: "in_progress",
          estimateHours: 2.5,
          dueDate: "2026-12-31",
        });
        const found = await repo.findTaskById(created.id);
        expect(found).toEqual(created);
        expect(found?.estimateHours, "numeric must become a number, not a string").toBe(2.5);
        expect(found?.dueDate, "date must stay the same calendar day as a YYYY-MM-DD string").toBe(
          "2026-12-31",
        );
      });

      it("throws ProjectNotFoundError for an unknown project", async () => {
        await expect(repo.createTask({ projectId: "999999", title: "orphan" })).rejects.toBeInstanceOf(
          ProjectNotFoundError,
        );
      });

      it("returns null for a missing task", async () => {
        expect(await repo.findTaskById("999999")).toBeNull();
      });
    });

    describe("listTasks", () => {
      it("returns tasks in creation order", async () => {
        for (const title of ["a", "b", "c"]) await repo.createTask({ projectId: project.id, title });
        const titles = (await repo.listTasks()).map((t) => t.title);
        expect(titles).toEqual(["a", "b", "c"]);
      });

      it("filters by project and status, and combines filters", async () => {
        const other = await repo.createProject({ name: "Other" });
        await repo.createTask({ projectId: project.id, title: "p1-todo" });
        await repo.createTask({ projectId: project.id, title: "p1-done", status: "done" });
        await repo.createTask({ projectId: other.id, title: "p2-done", status: "done" });

        const byProject = await repo.listTasks({ projectId: project.id });
        expect(byProject.map((t) => t.title)).toEqual(["p1-todo", "p1-done"]);

        const byStatus = await repo.listTasks({ status: "done" });
        expect(byStatus.map((t) => t.title)).toEqual(["p1-done", "p2-done"]);

        const both = await repo.listTasks({ projectId: other.id, status: "done" });
        expect(both.map((t) => t.title)).toEqual(["p2-done"]);
      });

      it("searches titles case-insensitively", async () => {
        await repo.createTask({ projectId: project.id, title: "Buy MILK" });
        await repo.createTask({ projectId: project.id, title: "Walk the dog" });
        const found = await repo.listTasks({ search: "milk" });
        expect(found.map((t) => t.title)).toEqual(["Buy MILK"]);
      });

      it("treats % and _ in search literally (no wildcards)", async () => {
        await repo.createTask({ projectId: project.id, title: "50% done" });
        await repo.createTask({ projectId: project.id, title: "500 done" });
        await repo.createTask({ projectId: project.id, title: "snake_case" });
        await repo.createTask({ projectId: project.id, title: "snakeXcase" });
        expect((await repo.listTasks({ search: "50%" })).map((t) => t.title)).toEqual(["50% done"]);
        expect((await repo.listTasks({ search: "e_c" })).map((t) => t.title)).toEqual(["snake_case"]);
      });

      it("honours limit and defaults to 50", async () => {
        for (let i = 0; i < 55; i++) await repo.createTask({ projectId: project.id, title: `t${i}` });
        expect(await repo.listTasks({ limit: 3 })).toHaveLength(3);
        expect(await repo.listTasks()).toHaveLength(50);
      });
    });

    describe("updateTask", () => {
      it("changes only the given fields and bumps updatedAt", async () => {
        const task = await repo.createTask({
          projectId: project.id,
          title: "Original",
          estimateHours: 1,
          dueDate: "2026-01-15",
        });
        const updated = await repo.updateTask(task.id, { status: "done" });
        expect(updated).toMatchObject({
          id: task.id,
          title: "Original",
          status: "done",
          estimateHours: 1,
          dueDate: "2026-01-15",
        });
        expect(updated!.updatedAt.getTime()).toBeGreaterThanOrEqual(task.updatedAt.getTime());
        expect(await repo.findTaskById(task.id)).toEqual(updated);
      });

      it("clears nullable fields when given null", async () => {
        const task = await repo.createTask({
          projectId: project.id,
          title: "Dated",
          estimateHours: 3,
          dueDate: "2026-03-01",
        });
        const updated = await repo.updateTask(task.id, { estimateHours: null, dueDate: null });
        expect(updated).toMatchObject({ estimateHours: null, dueDate: null, title: "Dated" });
      });

      it("moves a task to another project", async () => {
        const other = await repo.createProject({ name: "Other" });
        const task = await repo.createTask({ projectId: project.id, title: "Mover" });
        const moved = await repo.updateTask(task.id, { projectId: other.id });
        expect(moved?.projectId).toBe(other.id);
      });

      it("throws ProjectNotFoundError when moving to an unknown project", async () => {
        const task = await repo.createTask({ projectId: project.id, title: "Stuck" });
        await expect(repo.updateTask(task.id, { projectId: "999999" })).rejects.toBeInstanceOf(
          ProjectNotFoundError,
        );
      });

      it("returns null for a missing task", async () => {
        expect(await repo.updateTask("999999", { title: "nope" })).toBeNull();
      });
    });

    describe("deleteTask", () => {
      it("deletes and reports whether anything was deleted", async () => {
        const task = await repo.createTask({ projectId: project.id, title: "Temp" });
        expect(await repo.deleteTask(task.id)).toBe(true);
        expect(await repo.findTaskById(task.id)).toBeNull();
        expect(await repo.deleteTask(task.id)).toBe(false);
      });
    });

    describe("transaction", () => {
      it("commits when fn resolves and returns its value", async () => {
        const result = await repo.transaction(async (tx) => {
          await tx.createTask({ projectId: project.id, title: "inside" });
          return 42;
        });
        expect(result).toBe(42);
        expect((await repo.listTasks()).map((t) => t.title)).toEqual(["inside"]);
      });

      it("rolls back everything when fn throws, and rethrows the same error", async () => {
        const keep = await repo.createTask({ projectId: project.id, title: "keep me" });
        const boom = new Error("boom");
        await expect(
          repo.transaction(async (tx) => {
            await tx.createTask({ projectId: project.id, title: "should vanish" });
            await tx.updateTask(keep.id, { title: "should be undone" });
            throw boom;
          }),
        ).rejects.toBe(boom);

        const titles = (await repo.listTasks()).map((t) => t.title);
        expect(titles, "nothing done inside the failed transaction may persist").toEqual(["keep me"]);
      });
    });
  });
}
