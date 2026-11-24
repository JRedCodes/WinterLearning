export class DomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class UserNotFoundError extends DomainError {}
export class PostNotFoundError extends DomainError {}
export class InvalidCursorError extends DomainError {
  constructor() {
    super("cursor is invalid or expired");
  }
}
