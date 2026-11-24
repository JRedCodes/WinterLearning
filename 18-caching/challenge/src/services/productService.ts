import { ProductNotFoundError, type Product, type ProductPatch } from "../domain/product.js";
import type { ProductRepository } from "../repositories/productRepository.js";

const ID_PATTERN = /^[1-9]\d{0,17}$/;

/**
 * Business rules for products. Notice there is no caching code here: the
 * service talks to a ProductRepository, and the composition root decides
 * whether that's the plain Postgres repository or the cached one.
 */
export class ProductService {
  constructor(private readonly products: ProductRepository) {}

  async getProduct(id: string): Promise<Product> {
    // Reject garbage ids before they reach the cache or the database.
    // Otherwise "/products/aaaa", "/products/aaab", ... would each create a
    // negative cache entry (cache pollution) and a pointless query.
    if (!ID_PATTERN.test(id)) throw new ProductNotFoundError(id);
    const product = await this.products.findById(id);
    if (!product) throw new ProductNotFoundError(id);
    return product;
  }

  async updateProduct(id: string, patch: ProductPatch): Promise<Product> {
    if (!ID_PATTERN.test(id)) throw new ProductNotFoundError(id);
    const product = await this.products.update(id, patch);
    if (!product) throw new ProductNotFoundError(id);
    return product;
  }
}
