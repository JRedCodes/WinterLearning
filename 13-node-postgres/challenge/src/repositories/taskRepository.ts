import type { NewProject, NewTask, Project, Task, TaskFilter, TaskPatch } from "../domain/task.js";

/**
 * The port the service layer depends on. The service never knows whether
 * it is talking to memory or to Postgres; both implementations must pass
 * the same contract tests (test/contract/taskRepository.contract.ts).
 *
 * Errors: implementations throw domain errors, never driver errors, for
 * expected situations (e.g. ProjectNotFoundError when a task points at a
 * project that doesn't exist).
 */
export interface TaskRepository {
  createProject(input: NewProject): Promise<Project>;
  findProjectById(id: string): Promise<Project | null>;

  /** @throws ProjectNotFoundError if input.projectId doesn't exist */
  createTask(input: NewTask): Promise<Task>;
  findTaskById(id: string): Promise<Task | null>;
  /** Ordered by creation (oldest first, ties broken by id). */
  listTasks(filter?: TaskFilter): Promise<Task[]>;
  /**
   * Applies only the fields present in `patch` and bumps updatedAt.
   * Returns null if the task doesn't exist.
   * @throws ProjectNotFoundError if patch.projectId doesn't exist
   */
  updateTask(id: string, patch: TaskPatch): Promise<Task | null>;
  /** Returns false if there was nothing to delete. */
  deleteTask(id: string): Promise<boolean>;

  /**
   * Runs `fn` as one atomic unit of work. `fn` receives a repository bound
   * to the transaction: everything done through `tx` commits together if
   * `fn` resolves, and is rolled back if it throws (the error is rethrown).
   */
  transaction<T>(fn: (tx: TaskRepository) => Promise<T>): Promise<T>;
}
