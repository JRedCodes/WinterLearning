import { Router } from "express";
import { z } from "zod";
import { HttpError } from "../lib/httpError.js";
import type { ProductOverviewService } from "../services/productOverviewService.js";

const ProductId = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/);

export function productsRouter(service: ProductOverviewService): Router {
  const router = Router();

  router.get("/:id/overview", async (req, res) => {
    const parsed = ProductId.safeParse(req.params.id);
    if (!parsed.success) throw new HttpError(400, "INVALID_PRODUCT_ID", "Invalid product id");
    const result = await service.getOverview(parsed.data);
    res.json(result);
  });

  return router;
}
