/** Base class for errors the business logic expects and the HTTP layer knows how to map. */
export abstract class DomainError extends Error {
  abstract readonly code: string;
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class OrderNotFoundError extends DomainError {
  readonly code = "ORDER_NOT_FOUND";
  constructor(id: string) {
    super(`Order ${id} not found`);
  }
}

export class PaymentDeclinedError extends DomainError {
  readonly code = "PAYMENT_DECLINED";
  constructor() {
    super("The payment was declined");
  }
}

/** A downstream service is down or too slow. Maps to 503 so clients know to retry later. */
export class DependencyUnavailableError extends DomainError {
  readonly code = "DEPENDENCY_UNAVAILABLE";
  constructor(
    readonly dependency: string,
    options?: { cause?: unknown },
  ) {
    super(`${dependency} is unavailable`);
    if (options?.cause !== undefined) this.cause = options.cause;
  }
}
