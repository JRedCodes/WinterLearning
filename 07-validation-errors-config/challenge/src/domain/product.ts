/** A catalog product. Money is stored as integer cents: never floats. */
export interface Product {
  id: string;
  sku: string;
  name: string;
  category: string;
  priceCents: number;
  stock: number;
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
}
