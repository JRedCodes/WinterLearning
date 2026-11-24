import type { Order, OrderSummary } from "../types.js";

export interface SummarizeOptions {
  /** How many orders to process per slice of work. Default 5,000. */
  chunkSize?: number;
}

/**
 * Aggregates orders: count, per-currency totals, largest order.
 *
 * Big customers have hundreds of thousands of orders, and this runs inside the API process.
 * So the work is split into chunks, and we yield between chunks to let the server
 * handle other requests and timers in the meantime.
 */
export async function summarizeOrders(orders: readonly Order[], options: SummarizeOptions = {}): Promise<OrderSummary> {
  const chunkSize = options.chunkSize ?? 5_000;
  const summary: OrderSummary = { count: 0, byCurrency: {}, maxAmountCents: 0 };

  for (let start = 0; start < orders.length; start += chunkSize) {
    const end = Math.min(start + chunkSize, orders.length);
    for (let i = start; i < end; i++) {
      const order = orders[i]!;
      summary.count++;
      summary.byCurrency[order.currency] = (summary.byCurrency[order.currency] ?? 0) + order.amountCents;
      if (order.amountCents > summary.maxAmountCents) summary.maxAmountCents = order.amountCents;
    }
    // Yield to the event loop before the next chunk.
    await Promise.resolve();
  }

  return summary;
}
