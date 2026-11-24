import { describe, expect, it } from "vitest";
import { Bulkhead } from "../src/resilience/bulkhead.js";
import { BulkheadFullError } from "../src/resilience/errors.js";
import { deferred, flush, type Deferred } from "./helpers/deferred.js";

describe("Bulkhead (TODO 5)", () => {
  it("runs up to maxConcurrent calls at once", async () => {
    const bulkhead = new Bulkhead({ maxConcurrent: 2, maxQueue: 10 });
    const gates = [deferred(), deferred(), deferred()];
    let started = 0;
    const runs = gates.map((g) =>
      bulkhead.run(async () => {
        started++;
        await g.promise;
      }),
    );
    await flush();
    expect(started).toBe(2);
    expect(bulkhead.active).toBe(2);
    expect(bulkhead.queued).toBe(1);
    for (const g of gates) g.resolve();
    await Promise.all(runs);
    expect(started).toBe(3);
    expect(bulkhead.active).toBe(0);
  });

  it("rejects immediately with BulkheadFullError when running and queue are full", async () => {
    const bulkhead = new Bulkhead({ maxConcurrent: 1, maxQueue: 1 });
    const gate = deferred();
    const a = bulkhead.run(() => gate.promise);
    const b = bulkhead.run(() => gate.promise);
    await expect(bulkhead.run(async () => "c")).rejects.toBeInstanceOf(BulkheadFullError);
    gate.resolve();
    await Promise.all([a, b]);
  });

  it("starts queued calls in FIFO order as slots free up", async () => {
    const bulkhead = new Bulkhead({ maxConcurrent: 1, maxQueue: 5 });
    const order: number[] = [];
    const gates: Deferred<void>[] = [];
    const runs = [0, 1, 2, 3].map((i) => {
      const g = deferred();
      gates.push(g);
      return bulkhead.run(async () => {
        order.push(i);
        await g.promise;
      });
    });
    for (const g of gates) {
      await flush();
      g.resolve();
    }
    await Promise.all(runs);
    expect(order).toEqual([0, 1, 2, 3]);
  });

  it("never exceeds maxConcurrent under load", async () => {
    const bulkhead = new Bulkhead({ maxConcurrent: 3, maxQueue: 100 });
    let inFlight = 0;
    let max = 0;
    await Promise.all(
      Array.from({ length: 50 }, (_, i) =>
        bulkhead.run(async () => {
          inFlight++;
          max = Math.max(max, inFlight);
          await new Promise((r) => setTimeout(r, i % 3));
          inFlight--;
        }),
      ),
    );
    expect(max).toBe(3);
    expect(bulkhead.active).toBe(0);
    expect(bulkhead.queued).toBe(0);
  });

  it("frees the slot when fn rejects", async () => {
    const bulkhead = new Bulkhead({ maxConcurrent: 1, maxQueue: 0 });
    await expect(bulkhead.run(() => Promise.reject(new Error("x")))).rejects.toThrow("x");
    await expect(bulkhead.run(async () => "next")).resolves.toBe("next");
  });

  it("with maxQueue 0, sheds anything beyond maxConcurrent", async () => {
    const bulkhead = new Bulkhead({ maxConcurrent: 2, maxQueue: 0 });
    const gate = deferred();
    const results = await Promise.allSettled([1, 2, 3, 4].map(() => bulkhead.run(() => gate.promise.then(() => "ok"))).map(async (p, i) => {
      if (i === 3) gate.resolve();
      return p;
    }));
    expect(results.map((r) => r.status)).toEqual(["fulfilled", "fulfilled", "rejected", "rejected"]);
  });
});
