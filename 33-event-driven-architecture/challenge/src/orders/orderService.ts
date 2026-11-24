import { randomUUID } from "node:crypto";
import type pg from "pg";
import { OutOfStockError, UnknownSkuError, ValidationError } from "../domain/errors.js";
import type { EventBus } from "../events/eventBus.js";
import { orderPlacedMessage } from "../events/orderEvents.js";
import { withTransaction } from "../lib/db.js";
import { OrderRepository, type Order } from "./orderRepository.js";
import { ProductRepository, type PricedItem } from "./productRepository.js";

export interface PlaceOrderInput {
  customerId: string;
  items: { sku: string; quantity: number }[];
}

export interface OrderServiceDeps {
  pool: pg.Pool;
  bus: EventBus;
  ordersTopic: string;
  orders?: OrderRepository;
  products?: ProductRepository;
  newId?: () => string;
  now?: () => Date;
}

export class OrderService {
  private readonly pool: pg.Pool;
  private readonly bus: EventBus;
  private readonly ordersTopic: string;
  private readonly orders: OrderRepository;
  private readonly products: ProductRepository;
  private readonly newId: () => string;
  private readonly now: () => Date;

  constructor(deps: OrderServiceDeps) {
    this.pool = deps.pool;
    this.bus = deps.bus;
    this.ordersTopic = deps.ordersTopic;
    this.orders = deps.orders ?? new OrderRepository();
    this.products = deps.products ?? new ProductRepository();
    this.newId = deps.newId ?? randomUUID;
    this.now = deps.now ?? (() => new Date());
  }

  async placeOrder(input: PlaceOrderInput): Promise<Order> {
    const wanted = mergeItems(input.items);

    return withTransaction(this.pool, async (tx) => {
      const prices = await this.products.prices(tx, wanted.map((i) => i.sku));
      const unknown = wanted.filter((i) => !prices.has(i.sku)).map((i) => i.sku);
      if (unknown.length > 0) throw new UnknownSkuError(unknown);

      const items: PricedItem[] = wanted.map((i) => ({ ...i, unitPriceCents: prices.get(i.sku)! }));
      const totalCents = items.reduce((sum, i) => sum + i.quantity * i.unitPriceCents, 0);

      const order = await this.orders.insert(tx, { id: this.newId(), customerId: input.customerId, totalCents, currency: "EUR" });
      await this.orders.insertItems(tx, order.id, items);

      // Tell the rest of the company right away, so payments can start charging
      // while we finish reserving stock.
      await this.bus.publish(this.ordersTopic, [
        orderPlacedMessage({
          eventId: this.newId(),
          occurredAt: this.now().toISOString(),
          orderId: order.id,
          customerId: order.customerId,
          total: { amountCents: order.totalCents, currency: order.currency },
        }),
      ]);

      for (const item of items) {
        const ok = await this.products.reserve(tx, item.sku, item.quantity);
        if (!ok) throw new OutOfStockError(item.sku);
      }

      return { ...order, items };
    });
  }

  async getOrder(id: string): Promise<Order | undefined> {
    return this.orders.findById(this.pool, id);
  }
}

/** Same SKU twice in one request → one line with the summed quantity. */
function mergeItems(items: PlaceOrderInput["items"]): { sku: string; quantity: number }[] {
  if (items.length === 0) throw new ValidationError("an order needs at least one item");
  const bySku = new Map<string, number>();
  for (const { sku, quantity } of items) bySku.set(sku, (bySku.get(sku) ?? 0) + quantity);
  return [...bySku].map(([sku, quantity]) => ({ sku, quantity })).sort((a, b) => a.sku.localeCompare(b.sku));
}
