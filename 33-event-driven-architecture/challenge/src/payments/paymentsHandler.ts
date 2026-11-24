import type pg from "pg";
import type { ConsumedEvent } from "../events/eventBus.js";
import { HEADERS, ORDER_PLACED, type OrderPlaced } from "../events/orderEvents.js";
import { silentLogger, type Logger } from "../lib/logger.js";
import { PaymentRepository } from "./paymentRepository.js";

export interface PaymentsHandlerDeps {
  pool: pg.Pool;
  payments?: PaymentRepository;
  logger?: Logger;
}

/**
 * The payments service's reaction to OrderPlaced: charge the customer.
 * (Charging = recording a payment row; the real gateway call is out of scope.)
 */
export class PaymentsHandler {
  static readonly CONSUMER = "payments";

  private readonly pool: pg.Pool;
  private readonly payments: PaymentRepository;
  private readonly logger: Logger;

  constructor(deps: PaymentsHandlerDeps) {
    this.pool = deps.pool;
    this.payments = deps.payments ?? new PaymentRepository();
    this.logger = deps.logger ?? silentLogger;
  }

  async handle(message: ConsumedEvent): Promise<void> {
    if (message.headers[HEADERS.type] !== ORDER_PLACED) return; // not interested in other event types

    const event = JSON.parse(message.value ?? "null") as OrderPlaced;

    await this.payments.insert(this.pool, {
      orderId: event.orderId,
      customerId: event.customerId,
      amountCents: event.total.amountCents,
      currency: event.total.currency,
      eventId: event.eventId,
    });
    this.logger.info("charged customer", { orderId: event.orderId, amountCents: event.total.amountCents });
  }
}
