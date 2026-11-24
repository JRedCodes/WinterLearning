// Shared types for the report library. Plain data, no behavior.

export interface Customer {
  id: string;
  name: string;
}

export interface Order {
  id: string;
  customerId: string;
  /** Integer cents, never floats: 0.1 + 0.2 !== 0.3 */
  amountCents: number;
  /** ISO 4217 code, e.g. "EUR", "USD" */
  currency: string;
}

/** Where the data comes from: in production an HTTP API, in tests a fake. */
export interface DataSource {
  fetchCustomer(id: string, signal?: AbortSignal): Promise<Customer>;
  fetchOrders(customerId: string, signal?: AbortSignal): Promise<Order[]>;
  /** How many `to` you get for one `from` (e.g. USD→EUR = 0.92). */
  fetchRate(from: string, to: string): Promise<number>;
}

export interface AuditEvent {
  type: "report.generated";
  customerId: string;
  at: string;
}

/** Best-effort audit trail. Writing to it may be slow or fail; reports must not care. */
export interface AuditLog {
  record(event: AuditEvent): Promise<void>;
}

export interface Logger {
  error(message: string, err?: unknown): void;
}

export interface OrderSummary {
  count: number;
  /** Totals per currency, in that currency's cents. */
  byCurrency: Record<string, number>;
  /** Largest single order, in its own currency's cents. 0 when there are no orders. */
  maxAmountCents: number;
}

export interface CustomerReport {
  customerId: string;
  customerName: string;
  orderCount: number;
  /** Sum of all orders converted to the base currency, rounded to whole cents. */
  totalCents: number;
  baseCurrency: string;
}
