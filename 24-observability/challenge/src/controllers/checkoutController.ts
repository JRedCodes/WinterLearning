import type { RequestHandler } from "express";
import { z } from "zod";
import type { CheckoutService } from "../services/checkoutService.js";
import { HttpError } from "../middleware/errorHandler.js";

const CheckoutBody = z.object({
  customerId: z.string().min(1).max(100),
  items: z
    .array(
      z.object({
        sku: z.string().min(1).max(64),
        quantity: z.number().int().positive().max(1000),
        unitPriceCents: z.number().int().nonnegative(),
      }),
    )
    .min(1),
  payment: z.object({
    cardNumber: z.string().regex(/^\d{12,19}$/),
    cvc: z.string().regex(/^\d{3,4}$/),
  }),
});

/** Thin HTTP adapter: parse input, call the service, shape the response. */
export function checkoutController(service: CheckoutService) {
  const create: RequestHandler = async (req, res) => {
    const parsed = CheckoutBody.safeParse(req.body);
    if (!parsed.success) {
      throw new HttpError(
        400,
        "VALIDATION_FAILED",
        "Request body is invalid",
        parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      );
    }
    const order = await service.checkout(parsed.data);
    res.status(201).location(`/orders/${order.id}`).json({ data: order });
  };

  const show: RequestHandler<{ id: string }> = async (req, res) => {
    const order = await service.getOrder(req.params.id);
    res.json({ data: order });
  };

  return { create, show };
}
