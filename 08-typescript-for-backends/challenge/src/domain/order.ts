import type { OrderId, Sku, UserId } from "./ids.js";
import type { Cents } from "./money.js";

// "pending" | "paid" | "packed" | "shipped" | "cancelled"
// ("packed" was added last quarter when the warehouse team started scanning boxes.)
export type OrderStatus = string;

export interface OrderLine {
  sku: Sku;
  name: string;
  quantity: number;
  unitPriceCents: Cents;
}

export interface Order {
  id: OrderId;
  userId: UserId;
  status: OrderStatus;
  country: string;
  lines: OrderLine[];
  weightGrams: number;
  subtotalCents: Cents;
  shippingCents: Cents;
  totalCents: Cents;
  createdAt: string;
  paidAt?: string;
  packedAt?: string;
  shippedAt?: string;
  cancelledAt?: string;
  carrier?: string;
  trackingNumber?: string;
}

/** Customers may cancel until the warehouse has started working on the order. */
export function canCancel(order: Order): boolean {
  switch (order.status) {
    case "pending":
    case "paid":
      return true;
    case "shipped":
    case "cancelled":
      return false;
    default:
      // be lenient with statuses we don't know about
      return true;
  }
}
