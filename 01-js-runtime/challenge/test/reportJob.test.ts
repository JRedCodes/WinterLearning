import { describe, expect, it, vi } from "vitest";
import { createReportGenerator } from "../src/reportGenerator.js";
import { startReportJob } from "../src/reportJob.js";
import type { CustomerReport } from "../src/types.js";
import { FakeDataSource } from "./fakes.js";

function generator() {
  const source = new FakeDataSource()
    .addCustomer("c1", "Ada", [[100, "EUR"]])
    .addCustomer("c2", "Grace", [[200, "EUR"]]);
  return createReportGenerator(source, { logger: { error: vi.fn() } });
}

function collect(job: ReturnType<typeof startReportJob>) {
  const events: string[] = [];
  const finished = new Promise<CustomerReport[] | Error>((resolve) => {
    job.on("start", ({ total }) => events.push(`start:${total}`));
    job.on("progress", ({ done, total }) => events.push(`progress:${done}/${total}`));
    job.on("done", (reports) => {
      events.push("done");
      resolve(reports);
    });
    job.on("error", (err) => {
      events.push(`error:${err.message}`);
      resolve(err);
    });
  });
  const timeout = new Promise<"timeout">((resolve) => setTimeout(() => resolve("timeout"), 1000));
  return { events, result: Promise.race([finished, timeout]) };
}

describe("ReportJob events", () => {
  it("emits start, progress for each customer, then done, to listeners attached right after creation", async () => {
    const { events, result } = collect(startReportJob(generator(), ["c1", "c2"]));
    const reports = await result;
    expect(events, "listeners attached synchronously after startReportJob() must see every event").toEqual([
      "start:2",
      "progress:1/2",
      "progress:2/2",
      "done",
    ]);
    expect((reports as CustomerReport[]).map((r) => r.customerId)).toEqual(["c1", "c2"]);
  });

  it("an empty job still emits start and done", async () => {
    const { events, result } = collect(startReportJob(generator(), []));
    expect(await result, "the 'done' event never reached the listener").toEqual([]);
    expect(events).toEqual(["start:0", "done"]);
  });

  it("emits error (and no done) when a customer fails", async () => {
    const { events, result } = collect(startReportJob(generator(), ["c1", "missing", "c2"]));
    expect(await result).toBeInstanceOf(Error);
    expect(events).toEqual(["start:3", "progress:1/3", "error:customer missing not found"]);
  });
});
