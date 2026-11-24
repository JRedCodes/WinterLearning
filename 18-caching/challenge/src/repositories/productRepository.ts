import type { Product, ProductPatch } from "../domain/product.js";

/**
 * The port the service depends on. Both the Postgres repository and the
 * caching decorator implement it, so the service can't tell (and doesn't
 * care) whether a cache sits in front of the database.
 */
export interface ProductRepository {
  /** The product, or null if it doesn't exist. */
  findById(id: string): Promise<Product | null>;
  /** Applies the patch and returns the updated product, or null if it doesn't exist. */
  update(id: string, patch: ProductPatch): Promise<Product | null>;
}
