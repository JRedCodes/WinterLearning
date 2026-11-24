export abstract class DomainError extends Error {
  abstract readonly status: number;
  abstract readonly code: string;
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class ValidationError extends DomainError {
  readonly status = 400;
  readonly code = "VALIDATION_FAILED";
}

export class UnauthenticatedError extends DomainError {
  readonly status = 401;
  readonly code = "UNAUTHENTICATED";
  constructor() {
    super("Missing or invalid token");
  }
}

export class ForbiddenError extends DomainError {
  readonly status = 403;
  readonly code = "FORBIDDEN";
  constructor() {
    super("You are not allowed to do that");
  }
}

export class NotFoundError extends DomainError {
  readonly status = 404;
  readonly code = "NOT_FOUND";
}

export class ConflictError extends DomainError {
  readonly status = 409;
  readonly code = "CONFLICT";
}

/** The URL given to "import from URL" is not allowed (scheme, private address, ...). */
export class BlockedUrlError extends DomainError {
  readonly status = 400;
  readonly code = "URL_NOT_ALLOWED";
}

/** The remote server for "import from URL" misbehaved (error status, redirect, too big). */
export class UpstreamError extends DomainError {
  readonly status = 502;
  readonly code = "UPSTREAM_ERROR";
}
