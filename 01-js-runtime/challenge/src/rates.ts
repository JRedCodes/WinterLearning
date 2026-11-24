import type { DataSource } from "./types.js";

/**
 * Caches exchange rates for the lifetime of one report run.
 * Rates barely move within a run, and the rates API is slow and billed per call.
 */
export class RateCache {
  private readonly source: Pick<DataSource, "fetchRate">;
  private readonly rates = new Map<string, number>();

  constructor(source: Pick<DataSource, "fetchRate">) {
    this.source = source;
  }

  async get(from: string, to: string): Promise<number> {
    if (from === to) return 1;
    const key = `${from}->${to}`;

    const cached = this.rates.get(key);
    if (cached !== undefined) return cached;

    const rate = await this.source.fetchRate(from, to);
    this.rates.set(key, rate);
    return rate;
  }
}
