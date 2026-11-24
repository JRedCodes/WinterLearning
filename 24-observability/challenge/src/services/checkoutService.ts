import { randomUUID } from "node:crypto";
import type { PaymentsGateway } from "../clients/paymentsClient.js";
import { DependencyUnavailableError, OrderNotFoundError, PaymentDeclinedError } from "../domain/errors.js";
import { orderTotal, type CheckoutInput, type Order } from "../domain/order.js";
import type { HttpMetrics } from "../lib/metrics.js";
import { currentLogger } from "../lib/requestContext.js";
import type { Logger } from "../lib/logger.js";
import type { OrderRepository } from "../repositories/orderRepository.js";

export interface CheckoutServiceDeps {
  payments: PaymentsGateway;
  orders: OrderRepository;
  /** Fallback logger for work done outside a request (startup, jobs). */
  logger: Logger;
  metrics: HttpMetrics;
  newId?: () => string;
  now?: () => Date;
}

/**
 * Business logic for checkout. Knows nothing about HTTP.
 *
 * It logs through `currentLogger()`, which returns the request-scoped child
 * logger when called during a request, so these lines should carry the same
 * requestId and traceId as the access log. (Should.)
 */
export class CheckoutService {
  private readonly newId: () => string;
  private readonly now: () => Date;

  constructor(private readonly deps: CheckoutServiceDeps) {
    this.newId = deps.newId ?? randomUUID;
    this.now = deps.now ?? (() => new Date());
  }

  async checkout(input: CheckoutInput): Promise<Order> {
    const log = currentLogger(this.deps.logger);
    const amountCents = orderTotal(input.items);

    log.debug({ customerId: input.customerId, amountCents, payment: input.payment }, "authorizing payment");

    let result;
    try {
      result = await this.deps.payments.authorize({ amountCents, ...input.payment });
    } catch (err) {
      this.deps.metrics.checkoutsTotal.inc({ outcome: "error" });
      if (err instanceof DependencyUnavailableError) throw err;
      throw new DependencyUnavailableError("payments", { cause: err });
    }

    if (result.status === "declined") {
      this.deps.metrics.checkoutsTotal.inc({ outcome: "declined" });
      log.warn({ customerId: input.customerId, amountCents }, "payment declined");
      throw new PaymentDeclinedError();
    }

    const order: Order = {
      id: this.newId(),
      customerId: input.customerId,
      items: input.items,
      totalCents: amountCents,
      authorizationId: result.authorizationId,
      createdAt: this.now().toISOString(),
    };
    await this.deps.orders.save(order);

    this.deps.metrics.checkoutsTotal.inc({ outcome: "success" });
    log.info({ orderId: order.id, customerId: order.customerId, amountCents }, "payment authorized");
    return order;
  }

  async getOrder(id: string): Promise<Order> {
    const order = await this.deps.orders.findById(id);
    if (!order) throw new OrderNotFoundError(id);
    return order;
  }
}
