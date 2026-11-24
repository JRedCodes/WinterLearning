/**
 * `npm run demo`: runs the library against an in-memory fake API with realistic delays,
 * and measures event-loop delay while it works. Use it to SEE the symptoms from CHALLENGE.md
 * before and after your fixes. Nothing here is graded.
 */
import { monitorEventLoopDelay } from "node:perf_hooks";
import { setTimeout as sleep } from "node:timers/promises";
import { createReportGenerator, startReportJob } from "./index.js";
import type { Customer, DataSource, Order } from "./types.js";

const CUSTOMERS: Customer[] = Array.from({ length: 6 }, (_, i) => ({ id: `c${i + 1}`, name: `Customer ${i + 1}` }));
const CURRENCIES = ["EUR", "USD", "GBP"];
let rateCalls = 0;

function ordersFor(customerId: string, n: number): Order[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `${customerId}-o${i}`,
    customerId,
    amountCents: 100 + ((i * 7919) % 50_000),
    currency: CURRENCIES[i % CURRENCIES.length]!,
  }));
}

// Built up front so creating the big array doesn't count as "event-loop delay" later.
const BIG_ACCOUNT_ORDERS = ordersFor("c1", 1_500_000);

const api: DataSource = {
  async fetchCustomer(id, signal) {
    await sleep(80, undefined, { signal });
    const customer = CUSTOMERS.find((c) => c.id === id);
    if (!customer) throw new Error(`customer ${id} not found`);
    return customer;
  },
  async fetchOrders(customerId, signal) {
    await sleep(120, undefined, { signal });
    // c1 is a huge account: summarizing it is real CPU work.
    return customerId === "c1" ? BIG_ACCOUNT_ORDERS : ordersFor(customerId, 2_000);
  },
  async fetchRate(from, to) {
    rateCalls++;
    await sleep(50);
    return { USD: 0.92, GBP: 1.17, EUR: 1 }[from]! / ({ USD: 0.92, GBP: 1.17, EUR: 1 }[to] ?? 1);
  },
};

const audit = {
  async record() {
    await sleep(10);
    throw new Error("audit service unavailable");
  },
};

const loopDelay = monitorEventLoopDelay({ resolution: 10 });
loopDelay.enable();

const logger = { error: (message: string, err?: unknown) => console.log(`  [log] ${message}: ${(err as Error)?.message}`) };
const options = { audit, logger, timeoutMs: 1_000, concurrency: 3 };
const generator = createReportGenerator(api, options);

console.log("── single report (sequential vs parallel upstream calls)");
let t = performance.now();
console.log(await generator.buildCustomerReport("c2"));
console.log(`took ${(performance.now() - t).toFixed(0)}ms (parallel fetches ≈ 120ms + rates, sequential ≈ 200ms + rates)`);

console.log("\n── batch of 6 customers");
rateCalls = 0;
t = performance.now();
// A fresh generator = a fresh rate cache, so we can count rate API calls for this batch alone.
const reports = await createReportGenerator(api, options).buildCustomerReports(CUSTOMERS.map((c) => c.id));
console.log(`got ${reports.length} reports in ${(performance.now() - t).toFixed(0)}ms, rate API calls: ${rateCalls} (2 currency pairs → ideally 2)`);

console.log("\n── job with progress events");
await new Promise<void>((resolve) => {
  const job = startReportJob(generator, ["c3", "c4"]);
  job
    .on("start", ({ total }) => console.log(`start: ${total} customers`))
    .on("progress", ({ done, total }) => console.log(`progress: ${done}/${total}`))
    .on("done", () => {
      console.log("done");
      resolve();
    })
    .on("error", (err) => {
      console.log("error:", err.message);
      resolve();
    });
});

loopDelay.disable();
console.log(`\nworst event-loop delay during the run: ${(loopDelay.max / 1e6).toFixed(0)}ms`);
console.log("(a healthy server stays well under ~50ms; hundreds of ms means something blocked the loop)");
