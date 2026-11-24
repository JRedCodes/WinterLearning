/**
 * Domain types. No Express, no pg, no Redis in here.
 *
 * Note `updatedAt` is an ISO string, not a Date. Everything in a Product must
 * survive JSON.stringify -> JSON.parse unchanged, because that's exactly what
 * happens to it on its way through the cache. A Date would come back out of
 * the cache as a string and quietly change the type of your data.
 */
export interface Product {
  id: string;
  sku: string;
  name: string;
  description: string;
  priceCents: number;
  stock: number;
  updatedAt: string;
}

export type ProductPatch = Partial<Pick<Product, "name" | "description" | "priceCents" | "stock">>;

export class ProductNotFoundError extends Error {
  constructor(public readonly productId: string) {
    super(`Product ${productId} not found`);
    this.name = "ProductNotFoundError";
  }
}
