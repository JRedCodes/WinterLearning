import type { Order } from "../domain/order.js";

export interface Repository {
  findById(id: any): Promise<any>;
  save(entity: any): Promise<void>;
}

export interface OrderRepository extends Repository {
  listByUser(userId: any): Promise<Order[]>;
}

export class InMemoryOrderRepository implements OrderRepository {
  private orders = new Map<string, Order>();

  async findById(id: any) {
    return this.orders.get(id);
  }

  async save(order: Order) {
    // store a copy so callers can't mutate our state by accident
    this.orders.set(order.id, structuredClone(order));
  }

  async listByUser(userId: any) {
    return [...this.orders.values()].filter((o) => o.userId === userId);
  }
}
