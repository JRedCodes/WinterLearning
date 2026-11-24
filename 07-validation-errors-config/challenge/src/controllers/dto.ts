import type { Product } from "../domain/product.js";

export interface ProductDto {
  id: string;
  sku: string;
  name: string;
  category: string;
  priceCents: number;
  stock: number;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export function toProductDto(p: Product): ProductDto {
  return {
    id: p.id,
    sku: p.sku,
    name: p.name,
    category: p.category,
    priceCents: p.priceCents,
    stock: p.stock,
    tags: p.tags,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  };
}
