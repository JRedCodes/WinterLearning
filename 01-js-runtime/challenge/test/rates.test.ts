import { describe, expect, it } from "vitest";
import { RateCache } from "../src/rates.js";
import { FakeDataSource } from "./fakes.js";

describe("RateCache", () => {
  it("returns 1 for same-currency conversions without calling the API", async () => {
    const source = new FakeDataSource();
    expect(await new RateCache(source).get("EUR", "EUR")).toBe(1);
    expect(source.calls.rate).toBe(0);
  });

  it("caches a rate after the first lookup", async () => {
    const source = new FakeDataSource();
    const cache = new RateCache(source);
    expect(await cache.get("USD", "EUR")).toBe(0.5);
    expect(await cache.get("USD", "EUR")).toBe(0.5);
    expect(source.calls.rate).toBe(1);
  });

  it("calls the API only once when the same rate is requested concurrently", async () => {
    const source = new FakeDataSource();
    const cache = new RateCache(source);
    const results = await Promise.all([cache.get("USD", "EUR"), cache.get("USD", "EUR"), cache.get("USD", "EUR")]);
    expect(results).toEqual([0.5, 0.5, 0.5]);
    expect(source.calls.rate, "three concurrent lookups for USD->EUR should share ONE API call").toBe(1);
  });

  it("keeps different currency pairs separate", async () => {
    const source = new FakeDataSource();
    const cache = new RateCache(source);
    expect(await Promise.all([cache.get("USD", "EUR"), cache.get("GBP", "EUR")])).toEqual([0.5, 2]);
    expect(source.calls.rate).toBe(2);
  });

  it("does not cache failures: a later lookup retries", async () => {
    const source = new FakeDataSource();
    let attempt = 0;
    source.rateImpl = async () => {
      attempt++;
      await new Promise((r) => setTimeout(r, 5));
      if (attempt === 1) throw new Error("rates API 503");
      return 0.5;
    };
    const cache = new RateCache(source);
    const first = await Promise.allSettled([cache.get("USD", "EUR"), cache.get("USD", "EUR")]);
    expect(first.map((r) => r.status)).toEqual(["rejected", "rejected"]);
    expect(source.calls.rate, "concurrent callers share the failing call too").toBe(1);
    expect(await cache.get("USD", "EUR")).toBe(0.5);
    expect(source.calls.rate).toBe(2);
  });
});
