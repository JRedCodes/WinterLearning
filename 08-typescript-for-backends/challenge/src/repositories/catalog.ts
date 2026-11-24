import type { Cents } from "../domain/money.js";
import type { Sku } from "../domain/ids.js";

export interface Product {
  sku: Sku;
  name: string;
  priceCents: Cents;
  weightGrams: number;
}

export interface Catalog {
  findBySku(sku: string): Promise<any>;
}

export class InMemoryCatalog implements Catalog {
  private products: Map<string, Product>;

  constructor(products: Product[]) {
    this.products = new Map(products.map((p) => [p.sku, p]));
  }

  async findBySku(sku: string) {
    return this.products.get(sku);
  }
}
