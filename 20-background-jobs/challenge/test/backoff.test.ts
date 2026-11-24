import { describe, expect, it } from "vitest";
import { computeBackoff } from "../src/jobs/backoff.js";

const settings = { baseMs: 100, maxMs: 10_000 };
const half = () => 0.5;

describe("computeBackoff (TODO 1)", () => {
  it("doubles the ceiling with every failed attempt", () => {
    // random() = 0.5 → exactly half of the ceiling
    expect([1, 2, 3, 4, 5].map((n) => computeBackoff(n, settings, half))).toEqual([50, 100, 200, 400, 800]);
  });

  it("never exceeds maxMs, even after many attempts", () => {
    expect(computeBackoff(20, settings, half)).toBe(5_000);
    expect(computeBackoff(2000, settings, () => 0.999_999)).toBeLessThan(10_000);
    expect(Number.isFinite(computeBackoff(2000, settings, half)), "2^1999 must not leak out as Infinity").toBe(true);
  });

  it("uses full jitter: anywhere from 0 up to (not including) the ceiling", () => {
    expect(computeBackoff(3, settings, () => 0)).toBe(0);
    expect(computeBackoff(3, settings, () => 0.999)).toBe(399);
    const samples = Array.from({ length: 200 }, () => computeBackoff(4, settings));
    expect(samples.every((d) => d >= 0 && d < 800)).toBe(true);
    expect(new Set(samples).size, "real randomness should spread retries out").toBeGreaterThan(20);
  });

  it("returns whole milliseconds and treats attemptsMade < 1 as the first retry", () => {
    expect(Number.isInteger(computeBackoff(2, { baseMs: 33, maxMs: 1000 }, () => 0.37))).toBe(true);
    expect(computeBackoff(0, settings, half)).toBe(50);
  });
});
