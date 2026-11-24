import type { Product } from "../domain/product.js";
import type { ProductFilter, ProductRepository } from "./productRepository.js";

export class InMemoryProductRepository implements ProductRepository {
  readonly #rows = new Map<string, Product>();

  async insert(product: Product): Promise<void> {
    this.#rows.set(product.id, structuredClone(product));
  }

  async update(product: Product): Promise<void> {
    if (!this.#rows.has(product.id)) throw new Error(`unknown product ${product.id}`);
    this.#rows.set(product.id, structuredClone(product));
  }

  async delete(id: string): Promise<boolean> {
    return this.#rows.delete(id);
  }

  async findById(id: string): Promise<Product | undefined> {
    const row = this.#rows.get(id);
    return row ? structuredClone(row) : undefined;
  }

  async findBySku(sku: string): Promise<Product | undefined> {
    for (const row of this.#rows.values()) if (row.sku === sku) return structuredClone(row);
    return undefined;
  }

  async search(filter: ProductFilter, page: { offset: number; limit: number }) {
    const matches = [...this.#rows.values()].filter(
      (p) =>
        (filter.category === undefined || p.category === filter.category) &&
        (filter.minPriceCents === undefined || p.priceCents >= filter.minPriceCents) &&
        (filter.maxPriceCents === undefined || p.priceCents <= filter.maxPriceCents) &&
        (filter.inStock === undefined || p.stock > 0 === filter.inStock),
    );
    return {
      items: matches.slice(page.offset, page.offset + page.limit).map((p) => structuredClone(p)),
      total: matches.length,
    };
  }
}
