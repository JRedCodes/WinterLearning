/**
 * Errors the business layer throws on purpose. They know nothing about HTTP;
 * middleware/errorHandler.ts maps each `code` to a status.
 */
export abstract class DomainError extends Error {
  abstract readonly code: string;
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class NotFoundError extends DomainError {
  readonly code = "NOT_FOUND";
  constructor(what: string, id: number | string) {
    super(`${what} ${id} not found`);
  }
}

export class SoldOutError extends DomainError {
  readonly code = "SOLD_OUT";
  constructor(concertId: number, requested: number) {
    super(`Concert ${concertId} does not have ${requested} ticket(s) left`);
  }
}

export class InsufficientFundsError extends DomainError {
  readonly code = "INSUFFICIENT_FUNDS";
  constructor(walletId: number) {
    super(`Wallet ${walletId} has insufficient funds`);
  }
}

export class IdempotencyKeyReusedError extends DomainError {
  readonly code = "IDEMPOTENCY_KEY_REUSED";
  constructor() {
    super("This Idempotency-Key was already used with a different request body");
  }
}

export class InvalidOperationError extends DomainError {
  readonly code = "INVALID_OPERATION";
}
