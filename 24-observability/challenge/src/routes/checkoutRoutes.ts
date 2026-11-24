import { Router } from "express";
import type { CheckoutService } from "../services/checkoutService.js";
import { checkoutController } from "../controllers/checkoutController.js";

export function checkoutRoutes(service: CheckoutService): Router {
  const controller = checkoutController(service);
  const router = Router();
  router.post("/checkout", controller.create);
  router.get("/orders/:id", controller.show);
  return router;
}
