import type { Customer, DataSource, Order } from "../src/types.js";

/** Resolves after `ms` using a real timer; rejects early if the signal aborts. */
export function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason);
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(signal.reason);
      },
      { once: true },
    );
  });
}

/** Lets every pending callback (microtasks, timers due now, immediates) run. */
export function flushEventLoop(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 5));
}

export function makeOrders(customerId: string, amounts: Array<[number, string]>): Order[] {
  return amounts.map(([amountCents, currency], i) => ({ id: `${customerId}-${i}`, customerId, amountCents, currency }));
}

/**
 * An in-memory DataSource that records what happens to it:
 * how many times each method was called, and the maximum number of calls in flight at once.
 */
export class FakeDataSource implements DataSource {
  customers = new Map<string, Customer>();
  orders = new Map<string, Order[]>();
  rates: Record<string, number> = { "USD->EUR": 0.5, "GBP->EUR": 2 };
  latencyMs = { customer: 15, orders: 15, rate: 15 };

  calls = { customer: 0, orders: 0, rate: 0 };
  inFlight = 0;
  maxInFlight = 0;
  customerInFlight = 0;
  maxCustomerInFlight = 0;

  /** Optional hooks to make a method misbehave. */
  ordersImpl?: (customerId: string, signal?: AbortSignal) => Promise<Order[]>;
  rateImpl?: (from: string, to: string) => Promise<number>;

  addCustomer(id: string, name: string, amounts: Array<[number, string]> = []): this {
    this.customers.set(id, { id, name });
    this.orders.set(id, makeOrders(id, amounts));
    return this;
  }

  private async track<T>(work: () => Promise<T>): Promise<T> {
    this.inFlight++;
    this.maxInFlight = Math.max(this.maxInFlight, this.inFlight);
    try {
      return await work();
    } finally {
      this.inFlight--;
    }
  }

  fetchCustomer(id: string, signal?: AbortSignal): Promise<Customer> {
    this.calls.customer++;
    this.customerInFlight++;
    this.maxCustomerInFlight = Math.max(this.maxCustomerInFlight, this.customerInFlight);
    return this.track(async () => {
      try {
        await delay(this.latencyMs.customer, signal);
        const customer = this.customers.get(id);
        if (!customer) throw new Error(`customer ${id} not found`);
        return customer;
      } finally {
        this.customerInFlight--;
      }
    });
  }

  fetchOrders(customerId: string, signal?: AbortSignal): Promise<Order[]> {
    this.calls.orders++;
    return this.track(async () => {
      if (this.ordersImpl) return this.ordersImpl(customerId, signal);
      await delay(this.latencyMs.orders, signal);
      return this.orders.get(customerId) ?? [];
    });
  }

  fetchRate(from: string, to: string): Promise<number> {
    this.calls.rate++;
    return this.track(async () => {
      if (this.rateImpl) return this.rateImpl(from, to);
      await delay(this.latencyMs.rate);
      const rate = this.rates[`${from}->${to}`];
      if (rate === undefined) throw new Error(`no rate for ${from}->${to}`);
      return rate;
    });
  }
}
