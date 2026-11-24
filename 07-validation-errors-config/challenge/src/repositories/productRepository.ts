import type { Product } from "../domain/product.js";

export interface ProductFilter {
  category?: string;
  minPriceCents?: number;
  maxPriceCents?: number;
  inStock?: boolean;
}

export interface ProductRepository {
  insert(product: Product): Promise<void>;
  update(product: Product): Promise<void>;
  delete(id: string): Promise<boolean>;
  findById(id: string): Promise<Product | undefined>;
  findBySku(sku: string): Promise<Product | undefined>;
  /** Filtered products, oldest first, plus the total count before paging. */
  search(filter: ProductFilter, page: { offset: number; limit: number }): Promise<{ items: Product[]; total: number }>;
}
