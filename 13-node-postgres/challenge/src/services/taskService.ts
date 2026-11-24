import { ProjectNotFoundError, TaskNotFoundError } from "../domain/errors.js";
import type { NewTask, Project, Task, TaskFilter, TaskPatch } from "../domain/task.js";
import type { TaskRepository } from "../repositories/taskRepository.js";

/**
 * Business logic. Depends only on the TaskRepository interface.
 *
 * ⚠️ Challenge rule: do not change this file. Swapping the in-memory
 * repository for Postgres must not require touching the service layer.
 * That's the whole point of the repository pattern.
 */
export class TaskService {
  constructor(private readonly repo: TaskRepository) {}

  createProject(name: string): Promise<Project> {
    return this.repo.createProject({ name });
  }

  async getProject(id: string): Promise<Project> {
    const project = await this.repo.findProjectById(id);
    if (!project) throw new ProjectNotFoundError(id);
    return project;
  }

  createTask(input: NewTask): Promise<Task> {
    return this.repo.createTask(input);
  }

  async getTask(id: string): Promise<Task> {
    const task = await this.repo.findTaskById(id);
    if (!task) throw new TaskNotFoundError(id);
    return task;
  }

  listTasks(filter: TaskFilter): Promise<Task[]> {
    return this.repo.listTasks(filter);
  }

  async updateTask(id: string, patch: TaskPatch): Promise<Task> {
    const task = await this.repo.updateTask(id, patch);
    if (!task) throw new TaskNotFoundError(id);
    return task;
  }

  async deleteTask(id: string): Promise<void> {
    const deleted = await this.repo.deleteTask(id);
    if (!deleted) throw new TaskNotFoundError(id);
  }

  /**
   * Moves several tasks to another project, all or nothing.
   * If any task is missing (or anything else fails half-way), none move.
   */
  async moveTasks(taskIds: readonly string[], toProjectId: string): Promise<Task[]> {
    const ids = [...new Set(taskIds)];
    return this.repo.transaction(async (tx) => {
      const target = await tx.findProjectById(toProjectId);
      if (!target) throw new ProjectNotFoundError(toProjectId);

      const moved: Task[] = [];
      for (const id of ids) {
        const task = await tx.updateTask(id, { projectId: toProjectId });
        if (!task) throw new TaskNotFoundError(id);
        moved.push(task);
      }
      return moved;
    });
  }
}
