import { describe, expect, it } from "vitest";
import { summarizeOrders } from "../src/lib/summarize.js";
import type { Order } from "../src/types.js";

function manyOrders(n: number): Order[] {
  const currencies = ["EUR", "USD", "GBP"];
  return Array.from({ length: n }, (_, i) => ({
    id: `o${i}`,
    customerId: "c1",
    amountCents: (i % 1000) + 1,
    currency: currencies[i % 3]!,
  }));
}

describe("summarizeOrders", () => {
  it("summarizes an empty list", async () => {
    expect(await summarizeOrders([])).toEqual({ count: 0, byCurrency: {}, maxAmountCents: 0 });
  });

  it("computes count, per-currency totals and the largest order", async () => {
    const orders: Order[] = [
      { id: "1", customerId: "c", amountCents: 500, currency: "EUR" },
      { id: "2", customerId: "c", amountCents: 1200, currency: "USD" },
      { id: "3", customerId: "c", amountCents: 300, currency: "EUR" },
    ];
    expect(await summarizeOrders(orders, { chunkSize: 2 })).toEqual({
      count: 3,
      byCurrency: { EUR: 800, USD: 1200 },
      maxAmountCents: 1200,
    });
  });

  it("gives the same answer regardless of chunk size", async () => {
    const orders = manyOrders(10_007);
    const a = await summarizeOrders(orders, { chunkSize: 1 });
    const b = await summarizeOrders(orders, { chunkSize: 333 });
    const c = await summarizeOrders(orders, { chunkSize: 1_000_000 });
    expect(b).toEqual(a);
    expect(c).toEqual(a);
    expect(a.count).toBe(10_007);
  });

  it("lets other callbacks (timers, I/O, immediates) run between chunks", async () => {
    // A ticker that re-schedules itself with setImmediate: it only gets a turn when the
    // event loop itself gets a turn, NOT when the code merely awaits a resolved promise.
    let ticks = 0;
    let running = true;
    const tick = () => {
      ticks++;
      if (running) setImmediate(tick);
    };
    setImmediate(tick);

    await summarizeOrders(manyOrders(60_000), { chunkSize: 1_000 });
    running = false;

    expect(
      ticks,
      "60 chunks were processed but the event loop barely got a turn: the yield between chunks isn't really yielding",
    ).toBeGreaterThanOrEqual(20);
  });
});
