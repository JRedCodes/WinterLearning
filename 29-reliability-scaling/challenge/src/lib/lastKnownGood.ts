/**
 * A tiny in-process cache of the last successful value per key.
 *
 * Caching as resilience: when a dependency fails, a slightly stale answer
 * ("price as of 4 minutes ago") is usually far better than no answer.
 * `maxAgeMs` bounds how stale we're willing to go.
 */
export class LastKnownGood<V> {
  private readonly entries = new Map<string, { value: V; storedAt: number }>();

  constructor(
    private readonly options: { maxAgeMs: number; maxEntries: number; now?: () => number },
  ) {}

  set(key: string, value: V): void {
    this.entries.delete(key); // re-insert so Map order = recency
    this.entries.set(key, { value, storedAt: this.now() });
    if (this.entries.size > this.options.maxEntries) {
      const oldest = this.entries.keys().next().value;
      if (oldest !== undefined) this.entries.delete(oldest);
    }
  }

  get(key: string): V | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (this.now() - entry.storedAt > this.options.maxAgeMs) {
      this.entries.delete(key);
      return undefined;
    }
    return entry.value;
  }

  private now(): number {
    return (this.options.now ?? Date.now)();
  }
}
