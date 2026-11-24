import { EventEmitter } from "node:events";
import type { CustomerReport } from "./types.js";
import type { ReportGenerator } from "./reportGenerator.js";

/**
 * A long-running batch job that reports its progress through events, so a caller can stream
 * progress to a UI or a log. Customers are processed one at a time, in order.
 *
 * Events:
 *   "start"    { total }              once, before any work
 *   "progress" { done, total, report } after each customer
 *   "done"     CustomerReport[]       once, when all customers are processed
 *   "error"    Error                  once, if any customer fails (no "done" after that)
 *
 * Usage:
 *   const job = startReportJob(generator, ["c1", "c2"]);
 *   job.on("start", ...).on("progress", ...).on("done", ...).on("error", ...);
 */
export interface ReportJobEvents {
  start: [{ total: number }];
  progress: [{ done: number; total: number; report: CustomerReport }];
  done: [CustomerReport[]];
  error: [Error];
}

export class ReportJob extends EventEmitter<ReportJobEvents> {
  private readonly generator: ReportGenerator;
  private readonly customerIds: readonly string[];

  constructor(generator: ReportGenerator, customerIds: readonly string[]) {
    super();
    this.generator = generator;
    this.customerIds = customerIds;
    void this.run();
  }

  private async run(): Promise<void> {
    const total = this.customerIds.length;
    this.emit("start", { total });
    try {
      const reports: CustomerReport[] = [];
      for (const id of this.customerIds) {
        const report = await this.generator.buildCustomerReport(id);
        reports.push(report);
        this.emit("progress", { done: reports.length, total, report });
      }
      this.emit("done", reports);
    } catch (err) {
      this.emit("error", err instanceof Error ? err : new Error(String(err)));
    }
  }
}

export function startReportJob(generator: ReportGenerator, customerIds: readonly string[]): ReportJob {
  return new ReportJob(generator, customerIds);
}
