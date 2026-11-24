import { ProjectNotFoundError } from "../domain/errors.js";
import type { NewProject, NewTask, Project, Task, TaskFilter, TaskPatch } from "../domain/task.js";
import type { TaskRepository } from "./taskRepository.js";

const DEFAULT_LIMIT = 50;

/**
 * Reference implementation of the TaskRepository contract, kept in memory.
 * Fast and handy for service unit tests. It already passes the contract
 * suite, so read it when you're unsure what the Pg version should do.
 */
export class InMemoryTaskRepository implements TaskRepository {
  #projects = new Map<string, Project>();
  #tasks = new Map<string, Task>();
  #projectSeq = 0;
  #taskSeq = 0;

  async createProject(input: NewProject): Promise<Project> {
    const project: Project = { id: String(++this.#projectSeq), name: input.name, createdAt: new Date() };
    this.#projects.set(project.id, project);
    return { ...project };
  }

  async findProjectById(id: string): Promise<Project | null> {
    const p = this.#projects.get(id);
    return p ? { ...p } : null;
  }

  async createTask(input: NewTask): Promise<Task> {
    if (!this.#projects.has(input.projectId)) throw new ProjectNotFoundError(input.projectId);
    const now = new Date();
    const task: Task = {
      id: String(++this.#taskSeq),
      projectId: input.projectId,
      title: input.title,
      status: input.status ?? "todo",
      estimateHours: input.estimateHours ?? null,
      dueDate: input.dueDate ?? null,
      createdAt: now,
      updatedAt: now,
    };
    this.#tasks.set(task.id, task);
    return { ...task };
  }

  async findTaskById(id: string): Promise<Task | null> {
    const t = this.#tasks.get(id);
    return t ? { ...t } : null;
  }

  async listTasks(filter: TaskFilter = {}): Promise<Task[]> {
    const search = filter.search?.toLowerCase();
    return [...this.#tasks.values()]
      .filter((t) => filter.projectId === undefined || t.projectId === filter.projectId)
      .filter((t) => filter.status === undefined || t.status === filter.status)
      .filter((t) => search === undefined || t.title.toLowerCase().includes(search))
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || Number(a.id) - Number(b.id))
      .slice(0, filter.limit ?? DEFAULT_LIMIT)
      .map((t) => ({ ...t }));
  }

  async updateTask(id: string, patch: TaskPatch): Promise<Task | null> {
    const existing = this.#tasks.get(id);
    if (!existing) return null;
    if (patch.projectId !== undefined && !this.#projects.has(patch.projectId)) {
      throw new ProjectNotFoundError(patch.projectId);
    }
    const updated: Task = { ...existing, updatedAt: new Date() };
    if (patch.projectId !== undefined) updated.projectId = patch.projectId;
    if (patch.title !== undefined) updated.title = patch.title;
    if (patch.status !== undefined) updated.status = patch.status;
    if (patch.estimateHours !== undefined) updated.estimateHours = patch.estimateHours;
    if (patch.dueDate !== undefined) updated.dueDate = patch.dueDate;
    this.#tasks.set(id, updated);
    return { ...updated };
  }

  async deleteTask(id: string): Promise<boolean> {
    return this.#tasks.delete(id);
  }

  /**
   * "Transactions" in memory: snapshot everything, run fn, restore the
   * snapshot if fn throws. Fine for tests; not safe under concurrency
   * (that's what a real database is for).
   */
  async transaction<T>(fn: (tx: TaskRepository) => Promise<T>): Promise<T> {
    const snapshot = {
      projects: new Map(this.#projects),
      tasks: new Map(this.#tasks),
      projectSeq: this.#projectSeq,
      taskSeq: this.#taskSeq,
    };
    try {
      return await fn(this);
    } catch (err) {
      this.#projects = snapshot.projects;
      this.#tasks = snapshot.tasks;
      this.#projectSeq = snapshot.projectSeq;
      this.#taskSeq = snapshot.taskSeq;
      throw err;
    }
  }
}
