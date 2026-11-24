/**
 * Domain errors describe WHAT went wrong. middleware/problemDetails.ts turns
 * them into RFC 9457 problem responses. Each error has a stable `kind`, which
 * becomes the last segment of the problem "type" URI.
 */
export abstract class DomainError extends Error {
  abstract readonly kind: string;
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export interface FieldError {
  /** JSON Pointer to the offending field: "/title" for a body field, "/limit" for a query parameter. */
  pointer: string;
  detail: string;
}

export class ValidationError extends DomainError {
  readonly kind = "validation-error";
  constructor(
    message: string,
    readonly errors: FieldError[] = [],
  ) {
    super(message);
  }
}

export class NotFoundError extends DomainError {
  readonly kind = "not-found";
  constructor(what: string) {
    super(`${what} not found`);
  }
}

/** If-Match was sent but doesn't match the current version (someone else changed it). */
export class PreconditionFailedError extends DomainError {
  readonly kind = "precondition-failed";
  constructor(message = "The resource has been modified since you last fetched it") {
    super(message);
  }
}

/** The client must send If-Match for this operation (lost-update protection). */
export class PreconditionRequiredError extends DomainError {
  readonly kind = "precondition-required";
  constructor(message = "This request requires an If-Match header") {
    super(message);
  }
}

/** Same Idempotency-Key reused with a different request body. */
export class IdempotencyKeyReusedError extends DomainError {
  readonly kind = "idempotency-key-reused";
  constructor() {
    super("This Idempotency-Key was already used with a different request");
  }
}

/** A request with the same Idempotency-Key is still being processed. */
export class IdempotencyKeyInFlightError extends DomainError {
  readonly kind = "idempotency-key-in-flight";
  constructor() {
    super("A request with this Idempotency-Key is still being processed; retry later");
  }
}
