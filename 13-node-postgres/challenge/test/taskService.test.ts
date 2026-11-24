import { beforeEach, describe, expect, it } from "vitest";
import { ProjectNotFoundError, TaskNotFoundError } from "../src/domain/errors.js";
import { InMemoryTaskRepository } from "../src/repositories/inMemoryTaskRepository.js";
import { TaskService } from "../src/services/taskService.js";

// Fast unit tests of the business rules, no database. These pass from the
// start and must keep passing: you're not supposed to change the service.
describe("TaskService (in memory)", () => {
  let service: TaskService;
  beforeEach(() => {
    service = new TaskService(new InMemoryTaskRepository());
  });

  it("throws domain errors for missing things", async () => {
    await expect(service.getProject("1")).rejects.toBeInstanceOf(ProjectNotFoundError);
    await expect(service.getTask("1")).rejects.toBeInstanceOf(TaskNotFoundError);
    await expect(service.deleteTask("1")).rejects.toBeInstanceOf(TaskNotFoundError);
  });

  it("moves tasks atomically", async () => {
    const a = await service.createProject("A");
    const b = await service.createProject("B");
    const t1 = await service.createTask({ projectId: a.id, title: "1" });
    const t2 = await service.createTask({ projectId: a.id, title: "2" });

    await expect(service.moveTasks([t1.id, "999", t2.id], b.id)).rejects.toBeInstanceOf(TaskNotFoundError);
    expect((await service.getTask(t1.id)).projectId).toBe(a.id);

    const moved = await service.moveTasks([t1.id, t2.id, t1.id], b.id);
    expect(moved).toHaveLength(2); // duplicates are ignored
    expect((await service.getTask(t2.id)).projectId).toBe(b.id);
  });
});
