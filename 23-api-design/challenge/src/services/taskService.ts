import { NotFoundError } from "../domain/errors.js";
import type { Page } from "../domain/page.js";
import type { NewTask, Task, TaskListQuery, TaskPatch } from "../domain/task.js";
import type { Clock } from "../lib/clock.js";
import type { ProjectRepository } from "../repositories/projectRepository.js";
import type { TaskRepository } from "../repositories/taskRepository.js";

/**
 * What the client's If-Match header allows: "*" (any current version) or the
 * list of versions it is willing to overwrite (usually exactly one).
 */
export type ExpectedVersion = "*" | readonly number[];

export class TaskService {
  constructor(
    private readonly tasks: TaskRepository,
    private readonly projects: ProjectRepository,
    private readonly clock: Clock,
  ) {}

  async create(projectId: string, input: NewTask): Promise<Task> {
    await this.requireProject(projectId);
    return this.tasks.create(projectId, input, this.clock());
  }

  async get(id: string): Promise<Task> {
    const task = await this.tasks.findById(id);
    if (!task) throw new NotFoundError("Task");
    return task;
  }

  async remove(id: string): Promise<void> {
    if (!(await this.tasks.delete(id))) throw new NotFoundError("Task");
  }

  /**
   * TODO(4a): cursor-paginated list of a project's tasks.
   *   - unknown project -> NotFoundError("Project")
   *   - follow ProjectService.list: decode the cursor, reject a cursor whose
   *     `sort` differs from query.sort (ValidationError, pointer "/cursor"),
   *     fetch limit + 1 rows, build page.nextCursor from the last returned item
   *   - pass query.status and query.sort through to the repository
   */
  async list(_projectId: string, _query: TaskListQuery): Promise<Page<Task>> {
    throw new Error("Not implemented: TODO(4a) TaskService.list");
  }

  /**
   * TODO(4b): update with optimistic concurrency.
   *   - missing task -> NotFoundError("Task")
   *   - expectedVersion is a list that doesn't include the current version
   *     (an empty list included) -> PreconditionFailedError
   *   - expectedVersion "*" accepts whatever the current version is
   *   - then call tasks.updateIfVersion(id, current.version, patch, now).
   *     If it returns null, someone else won the race between our read and our
   *     write -> PreconditionFailedError as well.
   */
  async update(_id: string, _patch: TaskPatch, _expectedVersion: ExpectedVersion): Promise<Task> {
    throw new Error("Not implemented: TODO(4b) TaskService.update");
  }

  private async requireProject(projectId: string): Promise<void> {
    if (!(await this.projects.findById(projectId))) throw new NotFoundError("Project");
  }
}
