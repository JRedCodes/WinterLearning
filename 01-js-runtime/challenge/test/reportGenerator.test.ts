import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createReportGenerator } from "../src/reportGenerator.js";
import { TimeoutError } from "../src/lib/withTimeout.js";
import type { AuditLog, Logger } from "../src/types.js";
import { FakeDataSource, flushEventLoop } from "./fakes.js";

/** A Logger whose error() is a spy, so tests can assert on it and the output stays quiet. */
function quietLogger() {
  return { error: vi.fn<Logger["error"]>() };
}

function sourceWithCustomers(n: number): FakeDataSource {
  const source = new FakeDataSource();
  for (let i = 1; i <= n; i++) source.addCustomer(`c${i}`, `Customer ${i}`, [[1000 * i, "EUR"]]);
  return source;
}

describe("buildCustomerReport", () => {
  it("builds a report with totals converted to the base currency", async () => {
    const source = new FakeDataSource().addCustomer("c1", "Ada", [
      [1000, "EUR"],
      [2000, "USD"], // × 0.5 = 1000 EUR cents
      [500, "GBP"], //  × 2   = 1000 EUR cents
    ]);
    const report = await createReportGenerator(source, { logger: quietLogger() }).buildCustomerReport("c1");
    expect(report).toEqual({
      customerId: "c1",
      customerName: "Ada",
      orderCount: 3,
      totalCents: 3000,
      baseCurrency: "EUR",
    });
  });

  it("fetches the customer and their orders at the same time, not one after the other", async () => {
    const source = sourceWithCustomers(1);
    await createReportGenerator(source, { logger: quietLogger() }).buildCustomerReport("c1");
    expect(
      source.maxInFlight,
      "fetchCustomer and fetchOrders don't depend on each other, so both should be in flight together",
    ).toBe(2);
  });

  it("rejects with a TimeoutError when the orders service hangs", async () => {
    const source = sourceWithCustomers(1);
    // A badly behaved upstream: never answers and ignores the abort signal.
    source.ordersImpl = () => new Promise(() => {});
    const generator = createReportGenerator(source, { timeoutMs: 50, logger: quietLogger() });

    const outcome = await Promise.race([
      generator.buildCustomerReport("c1").then(
        () => "resolved",
        (err: unknown) => err,
      ),
      new Promise((resolve) => setTimeout(() => resolve("still pending after 1s"), 1000)),
    ]);
    expect(outcome, "timeoutMs is 50, so the report should fail fast instead of hanging").toBeInstanceOf(TimeoutError);
  });
});

describe("audit trail is best-effort", () => {
  const unhandled: unknown[] = [];
  const onUnhandled = (reason: unknown) => unhandled.push(reason);
  beforeEach(() => {
    unhandled.length = 0;
    process.on("unhandledRejection", onUnhandled);
  });
  afterEach(() => {
    process.off("unhandledRejection", onUnhandled);
  });

  it("a failing audit write does not fail the report, crash the process, or go unnoticed", async () => {
    const auditError = new Error("audit service unavailable");
    const audit: AuditLog = { record: vi.fn(async () => Promise.reject(auditError)) };
    const logger = quietLogger();
    const source = sourceWithCustomers(1);

    const report = await createReportGenerator(source, { audit, logger }).buildCustomerReport("c1");
    await flushEventLoop();

    expect(report.customerId).toBe("c1");
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ type: "report.generated", customerId: "c1" }));
    expect(unhandled, "the audit promise rejected and nobody handled it (unhandled rejection)").toEqual([]);
    expect(logger.error, "the audit failure should be logged via options.logger.error").toHaveBeenCalledWith(
      expect.any(String),
      auditError,
    );
  });

  it("a slow audit write does not delay the report", async () => {
    const audit: AuditLog = { record: () => new Promise(() => {}) }; // never settles
    const source = sourceWithCustomers(1);
    const outcome = await Promise.race([
      createReportGenerator(source, { audit, logger: quietLogger() })
        .buildCustomerReport("c1")
        .then(() => "resolved"),
      new Promise((resolve) => setTimeout(() => resolve("blocked on audit"), 1000)),
    ]);
    expect(outcome).toBe("resolved");
  });
});

describe("buildCustomerReports", () => {
  it("returns one report per customer, in the order the ids were given", async () => {
    const source = sourceWithCustomers(5);
    // Make earlier customers slower, so finishing order differs from input order.
    const original = source.fetchCustomer.bind(source);
    source.fetchCustomer = async (id, signal) => {
      await new Promise((r) => setTimeout(r, id === "c1" ? 40 : 5));
      return original(id, signal);
    };
    const reports = await createReportGenerator(source, { logger: quietLogger() }).buildCustomerReports([
      "c1",
      "c2",
      "c3",
      "c4",
      "c5",
    ]);
    expect(reports.map((r) => r.customerId)).toEqual(["c1", "c2", "c3", "c4", "c5"]);
    expect(reports.map((r) => r.totalCents)).toEqual([1000, 2000, 3000, 4000, 5000]);
  });

  it("processes several customers at once, but never more than `concurrency`", async () => {
    const source = sourceWithCustomers(8);
    await createReportGenerator(source, { concurrency: 3, logger: quietLogger() }).buildCustomerReports(
      ["c1", "c2", "c3", "c4", "c5", "c6", "c7", "c8"],
    );
    expect(source.calls.customer).toBe(8);
    expect(source.maxCustomerInFlight, "should use the allowed parallelism").toBe(3);
  });

  it("rejects if any customer fails", async () => {
    const source = sourceWithCustomers(2);
    await expect(
      createReportGenerator(source, { logger: quietLogger() }).buildCustomerReports(["c1", "nope", "c2"]),
    ).rejects.toThrow(/customer nope not found/);
  });
});
