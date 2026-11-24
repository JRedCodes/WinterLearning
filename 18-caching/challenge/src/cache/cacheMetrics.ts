/**
 * Counters describing how well the cache is doing. One instance per process,
 * created in the composition root and shared by the cached repository (which
 * records events) and the /metrics/cache route (which reports them).
 *
 * Counting rules (the tests rely on them):
 *  - Every findById call records exactly ONE of hit or miss.
 *    A cached "not found" answer (negative cache) counts as a hit.
 *  - A miss that joins a load already in flight (instead of querying the
 *    database itself) ALSO records coalesced.
 *  - Every operation on the cache that throws records an error.
 */
export interface CacheMetricsSnapshot {
  hits: number;
  misses: number;
  coalesced: number;
  errors: number;
  /** hits / (hits + misses), or 0 when there were no lookups yet. */
  hitRatio: number;
}

export class CacheMetrics {
  hits = 0;
  misses = 0;
  coalesced = 0;
  errors = 0;

  recordHit(): void {
    this.hits++;
  }
  recordMiss(): void {
    this.misses++;
  }
  recordCoalesced(): void {
    this.coalesced++;
  }
  recordError(): void {
    this.errors++;
  }

  /**
   * TODO(7a): return the current counters plus hitRatio.
   * Watch the division by zero before the first lookup.
   */
  snapshot(): CacheMetricsSnapshot {
    throw new Error("Not implemented: CacheMetrics.snapshot");
  }
}
