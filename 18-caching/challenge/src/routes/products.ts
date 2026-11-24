import { Router } from "express";
import type { ProductService } from "../services/productService.js";
import { productController } from "../controllers/productController.js";

export function productsRouter(service: ProductService): Router {
  const router = Router();
  const controller = productController(service);
  router.get("/:id", controller.get);
  router.patch("/:id", controller.patch);
  return router;
}
