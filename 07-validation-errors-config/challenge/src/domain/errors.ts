/**
 * The error hierarchy.
 *
 *   AppError (abstract: every error we EXPECT and can explain to a client)
 *   ├── ValidationError       input is malformed           (carries field details)
 *   ├── UnauthorizedError     caller isn't allowed in
 *   ├── NotFoundError         the thing doesn't exist
 *   │   └── ProductNotFoundError
 *   ├── ConflictError         clashes with existing state
 *   │   └── DuplicateSkuError
 *   └── BusinessRuleError     well-formed, but the rules say no
 *       └── InsufficientStockError
 *
 * Anything that is NOT an AppError is a bug or an outage → generic 500.
 *
 * No HTTP status codes in this file. The error handler maps CATEGORIES
 * (NotFoundError, ConflictError, ...) to statuses, so adding a new leaf error
 * needs no change there.
 */

export interface FieldIssue {
  /** Where the problem is, e.g. "body.priceCents" or "query.limit". */
  path: string;
  message: string;
}

export abstract class AppError extends Error {
  /** Stable, machine-readable code clients can branch on. */
  abstract readonly code: string;

  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class ValidationError extends AppError {
  readonly code = "VALIDATION_ERROR";
  constructor(readonly details: FieldIssue[]) {
    super("Request validation failed");
  }
}

export class UnauthorizedError extends AppError {
  readonly code = "UNAUTHORIZED";
  constructor(message = "Missing or invalid API key") {
    super(message);
  }
}

export abstract class NotFoundError extends AppError {}
export abstract class ConflictError extends AppError {}
export abstract class BusinessRuleError extends AppError {}

// -----------------------------------------------------------------------------
// TODO(4): Domain errors
//
// Make each class extend the right CATEGORY above and give it a `code`:
//
//   ProductNotFoundError(productId)        NotFoundError      "PRODUCT_NOT_FOUND"
//     message: `Product ${productId} not found`
//   DuplicateSkuError(sku)                 ConflictError      "DUPLICATE_SKU"
//     message: `A product with SKU ${sku} already exists`
//   InsufficientStockError(productId, requested, available)
//                                          BusinessRuleError  "INSUFFICIENT_STOCK"
//     message: `Only ${available} in stock, cannot reserve ${requested}`
//
// Keep the constructor arguments as public readonly properties: they're useful
// for logging and for tests (see test/errors.test.ts).
// -----------------------------------------------------------------------------

export class ProductNotFoundError extends Error {
  constructor(readonly productId: string) {
    super("TODO");
  }
}

export class DuplicateSkuError extends Error {
  constructor(readonly sku: string) {
    super("TODO");
  }
}

export class InsufficientStockError extends Error {
  constructor(
    readonly productId: string,
    readonly requested: number,
    readonly available: number,
  ) {
    super("TODO");
  }
}
