import type { RequestHandler } from "express";
import { z } from "zod";
import type { ProductService } from "../services/productService.js";

const PatchSchema = z
  .strictObject({
    name: z.string().trim().min(1).max(200).optional(),
    description: z.string().max(5000).optional(),
    priceCents: z.number().int().min(0).optional(),
    stock: z.number().int().min(0).optional(),
  })
  .refine((p) => Object.keys(p).length > 0, { message: "provide at least one field" });

/** HTTP <-> service translation only. No business rules, no caching. */
export function productController(service: ProductService) {
  const get: RequestHandler<{ id: string }> = async (req, res) => {
    const product = await service.getProduct(req.params.id);
    res.json({ data: product });
  };

  const patch: RequestHandler<{ id: string }> = async (req, res) => {
    const input = PatchSchema.parse(req.body);
    const product = await service.updateProduct(req.params.id, input);
    res.json({ data: product });
  };

  return { get, patch };
}
