import { Router } from "express";
import { z } from "zod";
import { ValidationError } from "../domain/errors.js";
import type { OrderService } from "./orderService.js";

const placeOrderSchema = z.object({
  customerId: z.string().min(1).max(100),
  items: z
    .array(z.object({ sku: z.string().min(1), quantity: z.number().int().min(1).max(100) }))
    .min(1)
    .max(50),
});

/** HTTP only: parse, call the service, shape the response. */
export function orderRoutes(orders: OrderService): Router {
  const router = Router();

  router.post("/", async (req, res) => {
    const parsed = placeOrderSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
    const order = await orders.placeOrder(parsed.data);
    res.status(201).location(`/orders/${order.id}`).json({ data: order });
  });

  router.get("/:id", async (req, res) => {
    const order = z.uuid().safeParse(req.params.id).success ? await orders.getOrder(req.params.id) : undefined;
    if (!order) {
      res.status(404).json({ error: { code: "NOT_FOUND", message: "Order not found" } });
      return;
    }
    res.json({ data: order });
  });

  return router;
}
