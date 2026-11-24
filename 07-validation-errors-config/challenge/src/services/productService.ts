import type { Product } from "../domain/product.js";
import type { ProductFilter, ProductRepository } from "../repositories/productRepository.js";
import type { Clock } from "../lib/clock.js";
import type { IdGenerator } from "../lib/ids.js";

/**
 * Input types are defined HERE, by the service, in plain TypeScript.
 * The zod schemas at the HTTP edge must produce values of these types
 * (the compiler checks it with `satisfies`), but the service itself never
 * imports zod or knows about HTTP.
 */
export interface NewProductInput {
  sku: string;
  name: string;
  category: string;
  priceCents: number;
  stock: number;
  tags: string[];
}

export interface ProductPatch {
  name?: string;
  category?: string;
  priceCents?: number;
  tags?: string[];
}

export interface ProductQuery extends ProductFilter {
  page: number;
  limit: number;
}

export interface ProductServiceDeps {
  products: ProductRepository;
  clock: Clock;
  ids: IdGenerator;
}

export class ProductService {
  readonly #deps: ProductServiceDeps;

  constructor(deps: ProductServiceDeps) {
    this.#deps = deps;
  }

  async list(query: ProductQuery): Promise<{ items: Product[]; total: number }> {
    const { page, limit, ...filter } = query;
    return this.#deps.products.search(filter, { offset: (page - 1) * limit, limit });
  }

  async get(id: string): Promise<Product> {
    const product = await this.#deps.products.findById(id);
    // TODO(5a): a missing product must be a ProductNotFoundError, not undefined.
    return product as Product;
  }

  async create(input: NewProductInput): Promise<Product> {
    const { products, clock, ids } = this.#deps;
    // TODO(5b): SKUs are unique. Throw DuplicateSkuError if one already exists.
    const now = clock.now();
    const product: Product = { id: ids("prd"), ...input, createdAt: now, updatedAt: now };
    await products.insert(product);
    return product;
  }

  async update(id: string, patch: ProductPatch): Promise<Product> {
    const existing = await this.get(id);
    const updated: Product = { ...existing, ...definedOnly(patch), updatedAt: this.#deps.clock.now() };
    await this.#deps.products.update(updated);
    return updated;
  }

  /** Takes `quantity` units out of stock (e.g. when an order is placed). */
  async reserve(id: string, quantity: number): Promise<Product> {
    const product = await this.get(id);
    // TODO(5c): never let stock go negative. Throw InsufficientStockError
    // (with the requested and available amounts) and change nothing.
    const updated: Product = { ...product, stock: product.stock - quantity, updatedAt: this.#deps.clock.now() };
    await this.#deps.products.update(updated);
    return updated;
  }

  async remove(id: string): Promise<void> {
    const deleted = await this.#deps.products.delete(id);
    // TODO(5d): deleting a product that doesn't exist is a ProductNotFoundError.
    void deleted;
  }
}

/** Drops keys whose value is undefined so a patch can't erase fields. */
function definedOnly<T extends object>(obj: T): Partial<T> {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as Partial<T>;
}
