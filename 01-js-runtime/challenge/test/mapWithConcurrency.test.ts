import { describe, expect, it } from "vitest";
import { mapWithConcurrency } from "../src/lib/mapWithConcurrency.js";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// This helper is correct. Its tests pass from the start; they document how it behaves.
describe("mapWithConcurrency (already correct)", () => {
  it("keeps input order and respects the limit", async () => {
    let active = 0;
    let maxActive = 0;
    const out = await mapWithConcurrency([30, 10, 20, 5, 15], 2, async (ms, i) => {
      active++;
      maxActive = Math.max(maxActive, active);
      await sleep(ms);
      active--;
      return i;
    });
    expect(out).toEqual([0, 1, 2, 3, 4]);
    expect(maxActive).toBe(2);
  });

  it("rejects with the first error", async () => {
    await expect(
      mapWithConcurrency([1, 2, 3], 2, async (n) => {
        if (n === 2) throw new Error("two");
        return n;
      }),
    ).rejects.toThrow("two");
  });

  it("handles an empty list and validates the limit", async () => {
    expect(await mapWithConcurrency([], 3, async (x) => x)).toEqual([]);
    await expect(mapWithConcurrency([1], 0, async (x) => x)).rejects.toThrow(RangeError);
  });
});
