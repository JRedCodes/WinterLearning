import type { Request, Response } from "express";
import type { OrderService } from "../services/orderService.js";
import type { PlaceOrderBody } from "./dto.js";
import { HttpError } from "../lib/httpError.js";
import { isValidSku, normalizeSku } from "../vendor/sku-check.js";

function validatePlaceOrder(body: any): PlaceOrderBody {
  if (!body || typeof body.country !== "string" || !Array.isArray(body.lines) || body.lines.length === 0) {
    throw new HttpError(400, "VALIDATION_ERROR", "country and lines are required");
  }
  for (const line of body.lines) {
    line.sku = normalizeSku(line.sku);
    if (!isValidSku(line.sku)) throw new HttpError(400, "VALIDATION_ERROR", `Invalid SKU: ${line.sku}`);
    if (line.quantity < 1) throw new HttpError(400, "VALIDATION_ERROR", "quantity must be at least 1");
  }
  return body as PlaceOrderBody;
}

export function ordersController(orders: OrderService) {
  return {
    async list(req: Request, res: Response) {
      const user = (req as any).user;
      res.json({ data: await orders.listOrders(user.id) });
    },

    async get(req: Request, res: Response) {
      const user = (req as any).user;
      res.json({ data: await orders.getOrder(user.id, req.params.id as string) });
    },

    async place(req: Request, res: Response) {
      const user = (req as any).user;
      const input = validatePlaceOrder(req.body);
      const order = await orders.placeOrder(user.id, input);
      res.status(201).location(`/orders/${order.id}`).json({ data: order });
    },

    async pay(req: Request, res: Response) {
      const user = (req as any).user;
      res.json({ data: await orders.payOrder(user.id, req.params.id as string) });
    },

    async cancel(req: Request, res: Response) {
      const user = (req as any).user;
      res.json({ data: await orders.cancelOrder(req.params.id as string, user.id) });
    },

    async pack(req: Request, res: Response) {
      res.json({ data: await orders.packOrder(req.params.id as string) });
    },

    async ship(req: Request, res: Response) {
      res.json({ data: await orders.shipOrder(req.params.id as string) });
    },
  };
}
