/**
 * Domain errors say WHAT went wrong. The HTTP error handler decides which
 * status code that becomes (see middleware/errorHandler.ts).
 */
export abstract class DomainError extends Error {
  abstract readonly code: string;
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export interface FieldIssue {
  path: string;
  message: string;
}

export class ValidationError extends DomainError {
  readonly code = "VALIDATION_ERROR";
  constructor(
    message: string,
    readonly details: FieldIssue[] = [],
  ) {
    super(message);
  }
}

/** Deliberately vague: never reveal whether the email or the password was wrong. */
export class InvalidCredentialsError extends DomainError {
  readonly code = "INVALID_CREDENTIALS";
  constructor() {
    super("Invalid email or password");
  }
}

export class UnauthenticatedError extends DomainError {
  readonly code = "UNAUTHENTICATED";
  constructor() {
    super("Authentication required");
  }
}

export class ForbiddenError extends DomainError {
  readonly code = "FORBIDDEN";
  constructor(message = "You do not have permission to do that") {
    super(message);
  }
}

export class NotFoundError extends DomainError {
  readonly code = "NOT_FOUND";
  constructor(what: string) {
    super(`${what} not found`);
  }
}

export class EmailTakenError extends DomainError {
  readonly code = "EMAIL_TAKEN";
  constructor() {
    super("An account with that email already exists");
  }
}
