/** TODO(4): the domain error hierarchy. */
import { describe, expect, it } from "vitest";
import {
  AppError,
  BusinessRuleError,
  ConflictError,
  DuplicateSkuError,
  InsufficientStockError,
  NotFoundError,
  ProductNotFoundError,
} from "../src/domain/errors.js";

describe("domain errors (TODO 4)", () => {
  it("ProductNotFoundError is a NotFoundError", () => {
    const err = new ProductNotFoundError("prd_1");
    expect(err).toBeInstanceOf(NotFoundError);
    expect(err).toBeInstanceOf(AppError);
    expect(err.code).toBe("PRODUCT_NOT_FOUND");
    expect(err.message).toBe("Product prd_1 not found");
    expect(err.productId).toBe("prd_1");
  });

  it("DuplicateSkuError is a ConflictError", () => {
    const err = new DuplicateSkuError("ABC-1");
    expect(err).toBeInstanceOf(ConflictError);
    expect(err.code).toBe("DUPLICATE_SKU");
    expect(err.message).toBe("A product with SKU ABC-1 already exists");
  });

  it("InsufficientStockError is a BusinessRuleError that remembers the numbers", () => {
    const err = new InsufficientStockError("prd_1", 5, 2);
    expect(err).toBeInstanceOf(BusinessRuleError);
    expect(err.code).toBe("INSUFFICIENT_STOCK");
    expect(err.message).toBe("Only 2 in stock, cannot reserve 5");
    expect({ requested: err.requested, available: err.available }).toEqual({ requested: 5, available: 2 });
  });

  it("errors are still real Errors with a useful name and stack", () => {
    const err = new ProductNotFoundError("prd_1");
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("ProductNotFoundError");
    expect(err.stack).toContain("ProductNotFoundError");
  });
});
