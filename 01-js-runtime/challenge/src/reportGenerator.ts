import { RateCache } from "./rates.js";
import { summarizeOrders } from "./lib/summarize.js";
import { withTimeout } from "./lib/withTimeout.js";
import type { AuditLog, CustomerReport, DataSource, Logger } from "./types.js";

export interface ReportGeneratorOptions {
  /** Currency all totals are converted to. Default "EUR". */
  baseCurrency?: string;
  /** Deadline for each upstream call. Default 2,000ms. */
  timeoutMs?: number;
  /** Max customers processed at once by buildCustomerReports. Default 4. */
  concurrency?: number;
  /** Passed to summarizeOrders. */
  chunkSize?: number;
  /** Best-effort audit trail. Default: discard. */
  audit?: AuditLog;
  /** Default: console. */
  logger?: Logger;
}

export interface ReportGenerator {
  buildCustomerReport(customerId: string): Promise<CustomerReport>;
  buildCustomerReports(customerIds: readonly string[]): Promise<CustomerReport[]>;
}

const noopAudit: AuditLog = { record: async () => {} };

export function createReportGenerator(source: DataSource, options: ReportGeneratorOptions = {}): ReportGenerator {
  const baseCurrency = options.baseCurrency ?? "EUR";
  const timeoutMs = options.timeoutMs ?? 2_000;
  const concurrency = options.concurrency ?? 4;
  const audit = options.audit ?? noopAudit;
  const logger = options.logger ?? console;
  const rates = new RateCache(source);

  async function buildCustomerReport(customerId: string): Promise<CustomerReport> {
    const customer = await withTimeout((signal) => source.fetchCustomer(customerId, signal), timeoutMs);
    const orders = await withTimeout((signal) => source.fetchOrders(customerId, signal), timeoutMs);

    const summary = await summarizeOrders(orders, { chunkSize: options.chunkSize });

    const currencies = Object.keys(summary.byCurrency);
    const converted = await Promise.all(
      currencies.map(async (currency) => summary.byCurrency[currency]! * (await rates.get(currency, baseCurrency))),
    );
    const totalCents = Math.round(converted.reduce((sum, cents) => sum + cents, 0));

    // Audit is best-effort: it must never slow down or fail a report.
    audit.record({ type: "report.generated", customerId, at: new Date().toISOString() });

    return {
      customerId,
      customerName: customer.name,
      orderCount: summary.count,
      totalCents,
      baseCurrency,
    };
  }

  async function buildCustomerReports(customerIds: readonly string[]): Promise<CustomerReport[]> {
    const reports: CustomerReport[] = [];
    customerIds.forEach(async (id) => {
      reports.push(await buildCustomerReport(id));
    });
    return reports;
  }

  return { buildCustomerReport, buildCustomerReports };
}
