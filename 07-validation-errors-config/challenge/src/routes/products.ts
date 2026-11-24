import { Router } from "express";
import { createProductController } from "../controllers/productController.js";
import { requireApiKey } from "../middleware/requireApiKey.js";
import { validate } from "../middleware/validate.js";
import {
  createProductSchema,
  makeListProductsQuerySchema,
  productParamsSchema,
  reserveSchema,
  updateProductSchema,
} from "../schemas/product.js";
import type { ProductService } from "../services/productService.js";

export interface ProductsRouterDeps {
  productService: ProductService;
  pagination: { defaultLimit: number; maxLimit: number };
  apiKey: string | undefined;
}

/** Each route reads left to right: auth → validation → controller. */
export function productsRouter(deps: ProductsRouterDeps): Router {
  const c = createProductController(deps.productService);
  const auth = requireApiKey(deps.apiKey);
  const params = productParamsSchema;
  const router = Router();

  router.get("/", validate({ query: makeListProductsQuerySchema(deps.pagination) }), c.list);
  router.get("/:id", validate({ params }), c.get);
  router.post("/", auth, validate({ body: createProductSchema }), c.create);
  router.patch("/:id", auth, validate({ params, body: updateProductSchema }), c.update);
  router.post("/:id/reserve", auth, validate({ params, body: reserveSchema }), c.reserve);
  router.delete("/:id", auth, validate({ params }), c.remove);

  return router;
}
