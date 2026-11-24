import type { Clock } from "../lib/clock.js";
import type { CarrierClient } from "../integrations/carrierClient.js";
import type { Catalog } from "../repositories/catalog.js";
import type { OrderRepository } from "../repositories/orderRepository.js";
import { DomainError } from "../domain/errors.js";
import { canCancel, type Order, type OrderLine } from "../domain/order.js";
import { addCents, multiplyCents } from "../domain/money.js";
import type { OrderId, UserId } from "../domain/ids.js";

export interface OrderServiceDeps {
  orders: OrderRepository;
  catalog: Catalog;
  carrier: CarrierClient;
  clock: Clock;
  newOrderId: () => OrderId;
}

export class OrderService {
  constructor(private readonly deps: OrderServiceDeps) {}

  private now() {
    return this.deps.clock.now().toISOString();
  }

  async placeOrder(userId: UserId, input: { country: string; lines: any[] }): Promise<Order> {
    const lines: OrderLine[] = [];
    let weightGrams = 0;
    for (const line of input.lines) {
      const product = await this.deps.catalog.findBySku(line.sku);
      if (!product) throw new DomainError("UNKNOWN_SKU", `Unknown SKU: ${line.sku}`);
      lines.push({ sku: product.sku, name: product.name, quantity: line.quantity, unitPriceCents: product.priceCents });
      weightGrams += product.weightGrams * line.quantity;
    }

    const quote = await this.deps.carrier.quote({ country: input.country, weightGrams });
    const subtotalCents = addCents(...lines.map((l) => multiplyCents(l.unitPriceCents, l.quantity)));

    const order: Order = {
      id: this.deps.newOrderId(),
      userId,
      status: "pending",
      country: input.country,
      lines,
      weightGrams,
      subtotalCents,
      shippingCents: quote.amountCents,
      totalCents: addCents(subtotalCents, quote.amountCents),
      createdAt: this.now(),
    };
    await this.deps.orders.save(order);
    return order;
  }

  async listOrders(userId: UserId): Promise<Order[]> {
    return this.deps.orders.listByUser(userId);
  }

  /** Customers only ever see their own orders; anything else is "not found". */
  async getOrder(userId: UserId, orderId: OrderId): Promise<Order> {
    const order = await this.deps.orders.findById(orderId);
    if (!order || order.userId !== userId) throw new DomainError("ORDER_NOT_FOUND", "Order not found");
    return order;
  }

  async payOrder(userId: UserId, orderId: OrderId): Promise<Order> {
    const order = await this.getOrder(userId, orderId);
    if (order.status !== "pending") throw invalidTransition(order, "pay");
    const paid = { ...order, status: "paid", paidAt: this.now() };
    await this.deps.orders.save(paid);
    return paid;
  }

  async cancelOrder(userId: UserId, orderId: OrderId): Promise<Order> {
    const order = await this.getOrder(userId, orderId);
    if (!canCancel(order)) {
      throw new DomainError("ORDER_NOT_CANCELLABLE", `A ${order.status} order can no longer be cancelled`);
    }
    const cancelled = { ...order, status: "cancelled", cancelledAt: this.now() };
    await this.deps.orders.save(cancelled);
    return cancelled;
  }

  /** Warehouse only (enforced by the route). */
  async packOrder(orderId: OrderId): Promise<Order> {
    const order = await this.findOrThrow(orderId);
    if (order.status !== "paid") throw invalidTransition(order, "pack");
    const packed = { ...order, status: "packed", packedAt: this.now() };
    await this.deps.orders.save(packed);
    return packed;
  }

  /** Warehouse only (enforced by the route). Books the shipment with the carrier. */
  async shipOrder(orderId: OrderId): Promise<Order> {
    const order = await this.findOrThrow(orderId);
    if (order.status !== "packed") throw invalidTransition(order, "ship");
    const shipment = await this.deps.carrier.createShipment({
      orderId: order.id,
      country: order.country,
      weightGrams: order.weightGrams,
    });
    const shipped = {
      ...order,
      status: "shipped",
      shippedAt: this.now(),
      carrier: shipment.carrier,
      trackingNumber: shipment.trackingNumber,
    };
    await this.deps.orders.save(shipped);
    return shipped;
  }

  private async findOrThrow(orderId: OrderId): Promise<Order> {
    const order = await this.deps.orders.findById(orderId);
    if (!order) throw new DomainError("ORDER_NOT_FOUND", "Order not found");
    return order;
  }
}

function invalidTransition(order: Order, action: string) {
  return new DomainError("INVALID_TRANSITION", `Cannot ${action} an order that is ${order.status}`);
}
