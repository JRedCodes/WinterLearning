import { describe, expect, it } from "vitest";
import { ttlWithJitter } from "../src/cache/ttl.js";

describe("ttlWithJitter (TODO 1)", () => {
  it("maps random()=0 to the low end, 0.5 to the base, ~1 to the high end", () => {
    expect(ttlWithJitter(100, 0.1, () => 0)).toBe(90);
    expect(ttlWithJitter(100, 0.1, () => 0.5)).toBe(100);
    expect(ttlWithJitter(100, 0.1, () => 0.999999)).toBe(110);
  });

  it("returns whole seconds", () => {
    expect(Number.isInteger(ttlWithJitter(300, 0.1, () => 0.123))).toBe(true);
  });

  it("returns exactly the base when jitterRatio is 0", () => {
    expect(ttlWithJitter(60, 0, () => 0)).toBe(60);
    expect(ttlWithJitter(60, 0, () => 0.99)).toBe(60);
  });

  it("never returns less than 1", () => {
    expect(ttlWithJitter(1, 0.9, () => 0)).toBe(1);
  });

  it("spreads values across the whole range with the default Math.random", () => {
    const values = Array.from({ length: 2000 }, () => ttlWithJitter(300, 0.2));
    expect(Math.min(...values)).toBeGreaterThanOrEqual(240);
    expect(Math.max(...values)).toBeLessThanOrEqual(360);
    expect(new Set(values).size, "all TTLs identical: no jitter applied").toBeGreaterThan(50);
  });
});
