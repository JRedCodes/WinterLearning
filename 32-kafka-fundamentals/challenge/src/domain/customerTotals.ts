/**
 * The read model the projection builds: one row per customer.
 * "Projection" = a view derived by folding over a stream of events.
 */
export interface CustomerTotals {
  customerId: string;
  /** Number of OrderPlaced events seen for this customer. */
  placedCount: number;
  /** Number of OrderCancelled events seen for this customer. */
  cancelledCount: number;
  /** Sum of placed totals minus sum of cancelled (refunded) totals, in cents. */
  netTotalCents: number;
  /** The latest occurredAt among the events applied so far (ISO-8601). */
  lastEventAt: string;
}
