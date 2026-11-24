/** TODO(5): the service throws domain errors. No HTTP here. */
import { beforeEach, describe, expect, it } from "vitest";
import { DuplicateSkuError, InsufficientStockError, ProductNotFoundError } from "../src/domain/errors.js";
import { InMemoryProductRepository } from "../src/repositories/inMemoryProductRepository.js";
import { type NewProductInput, ProductService } from "../src/services/productService.js";

const input = (overrides: Partial<NewProductInput> = {}): NewProductInput => ({
  sku: "MUG-01",
  name: "Mug",
  category: "kitchen",
  priceCents: 899,
  stock: 5,
  tags: [],
  ...overrides,
});

describe("ProductService (TODO 5)", () => {
  let repo: InMemoryProductRepository;
  let service: ProductService;

  beforeEach(() => {
    repo = new InMemoryProductRepository();
    let n = 0;
    service = new ProductService({
      products: repo,
      clock: { now: () => new Date("2030-01-01T00:00:00Z") },
      ids: (prefix) => `${prefix}_${++n}`,
    });
  });

  it("get throws ProductNotFoundError for an unknown id", async () => {
    await expect(service.get("prd_nope")).rejects.toBeInstanceOf(ProductNotFoundError);
  });

  it("create rejects a duplicate SKU and stores nothing", async () => {
    await service.create(input());
    await expect(service.create(input({ name: "Another mug" }))).rejects.toBeInstanceOf(DuplicateSkuError);
    expect((await repo.search({}, { offset: 0, limit: 10 })).total).toBe(1);
  });

  it("reserve decrements stock", async () => {
    const p = await service.create(input({ stock: 5 }));
    expect((await service.reserve(p.id, 5)).stock).toBe(0);
  });

  it("reserve refuses to go below zero, reports the numbers, and changes nothing", async () => {
    const p = await service.create(input({ stock: 2 }));
    const err = await service.reserve(p.id, 3).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(InsufficientStockError);
    expect(err).toMatchObject({ productId: p.id, requested: 3, available: 2 });
    expect((await repo.findById(p.id))?.stock).toBe(2);
  });

  it("update and reserve throw ProductNotFoundError for unknown ids", async () => {
    await expect(service.update("prd_nope", { name: "x" })).rejects.toBeInstanceOf(ProductNotFoundError);
    await expect(service.reserve("prd_nope", 1)).rejects.toBeInstanceOf(ProductNotFoundError);
  });

  it("remove throws ProductNotFoundError when nothing was deleted", async () => {
    await expect(service.remove("prd_nope")).rejects.toBeInstanceOf(ProductNotFoundError);
    const p = await service.create(input());
    await expect(service.remove(p.id)).resolves.toBeUndefined();
  });
});
