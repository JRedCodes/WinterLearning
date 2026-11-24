import { Router } from "express";
import type { OrderService } from "../services/orderService.js";
import type { UserDirectory } from "../repositories/userDirectory.js";
import { ordersController } from "../controllers/ordersController.js";
import { authenticate, requireRole } from "../middleware/auth.js";

export function ordersRouter(orders: OrderService, users: UserDirectory): Router {
  const c = ordersController(orders);
  const router = Router();

  router.use(authenticate(users));
  router.get("/", c.list);
  router.post("/", c.place);
  router.get("/:id", c.get);
  router.post("/:id/pay", c.pay);
  router.post("/:id/cancel", c.cancel);
  router.post("/:id/pack", requireRole("warehouse"), c.pack);
  router.post("/:id/ship", requireRole("warehouse"), c.ship);

  return router;
}
