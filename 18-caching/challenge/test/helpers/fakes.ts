import type { Cache } from "../../src/cache/cache.js";
import type { Product, ProductPatch } from "../../src/domain/product.js";
import type { ProductRepository } from "../../src/repositories/productRepository.js";

export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function makeProduct(id: string, overrides: Partial<Product> = {}): Product {
  return {
    id,
    sku: `SKU-${id}`,
    name: `Product ${id}`,
    description: "",
    priceCents: 1000,
    stock: 5,
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

/**
 * In-memory stand-in for the slow database: counts calls and takes
 * `delayMs` per findById so concurrent requests overlap.
 */
export class FakeProductRepository implements ProductRepository {
  findByIdCalls = 0;
  updateCalls = 0;
  failNextFind = false;
  readonly products = new Map<string, Product>();

  constructor(
    seed: Product[] = [],
    private readonly delayMs = 30,
  ) {
    for (const p of seed) this.products.set(p.id, p);
  }

  async findById(id: string): Promise<Product | null> {
    this.findByIdCalls++;
    await sleep(this.delayMs);
    if (this.failNextFind) {
      this.failNextFind = false;
      throw new Error("database exploded");
    }
    return this.products.get(id) ?? null;
  }

  async update(id: string, patch: ProductPatch): Promise<Product | null> {
    this.updateCalls++;
    const existing = this.products.get(id);
    if (!existing) return null;
    const updated = { ...existing, ...patch, updatedAt: new Date().toISOString() };
    this.products.set(id, updated);
    return updated;
  }
}

/** A cache whose every operation fails, like Redis being down. */
export class BrokenCache implements Cache {
  async get(): Promise<string | null> {
    throw new Error("ECONNREFUSED");
  }
  async set(): Promise<void> {
    throw new Error("ECONNREFUSED");
  }
  async del(): Promise<void> {
    throw new Error("ECONNREFUSED");
  }
}
