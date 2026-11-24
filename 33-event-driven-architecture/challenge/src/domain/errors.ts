/** Expected business errors. The HTTP layer maps them to status codes. */
export class DomainError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class ValidationError extends DomainError {
  constructor(message: string) {
    super("VALIDATION_FAILED", message);
  }
}

export class UnknownSkuError extends DomainError {
  constructor(readonly skus: string[]) {
    super("UNKNOWN_SKU", `Unknown product(s): ${skus.join(", ")}`);
  }
}

export class OutOfStockError extends DomainError {
  constructor(readonly sku: string) {
    super("OUT_OF_STOCK", `Not enough stock for ${sku}`);
  }
}
