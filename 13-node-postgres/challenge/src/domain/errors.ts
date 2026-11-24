/**
 * Domain errors say WHAT went wrong in business terms. The HTTP error
 * handler decides how each one is represented on the wire.
 */
export class DomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class ProjectNotFoundError extends DomainError {
  constructor(public readonly projectId: string) {
    super(`Project ${projectId} not found`);
  }
}

export class TaskNotFoundError extends DomainError {
  constructor(public readonly taskId: string) {
    super(`Task ${taskId} not found`);
  }
}
