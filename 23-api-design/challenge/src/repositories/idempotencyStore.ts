/**
 * Stores the outcome of requests that carried an Idempotency-Key, so a retry
 * gets the original response instead of creating a second resource.
 *
 * In production this is Redis (SET key value NX EX 86400) or a Postgres table
 * with a unique index on the key. In-memory here.
 */
export interface StoredResponse {
  status: number;
  headers: Record<string, string>;
  body: unknown;
}

export type IdempotencyRecord =
  | { state: "in_progress"; fingerprint: string; expiresAt: number }
  | { state: "completed"; fingerprint: string; expiresAt: number; response: StoredResponse };

export interface IdempotencyStore {
  get(key: string): Promise<IdempotencyRecord | null>;
  /**
   * Atomically claims the key: returns true and stores an in_progress record if
   * the key is free; returns false if any record already exists.
   */
  begin(key: string, fingerprint: string): Promise<boolean>;
  complete(key: string, response: StoredResponse): Promise<void>;
  /** Forget the key (e.g. the request failed with a 5xx and may be retried). */
  release(key: string): Promise<void>;
}

export class InMemoryIdempotencyStore implements IdempotencyStore {
  private readonly records = new Map<string, IdempotencyRecord>();

  constructor(
    private readonly opts: { ttlMs: number; now: () => number } = { ttlMs: 24 * 60 * 60 * 1000, now: Date.now },
  ) {}

  async get(key: string): Promise<IdempotencyRecord | null> {
    const r = this.records.get(key);
    if (!r) return null;
    if (r.expiresAt <= this.opts.now()) {
      this.records.delete(key);
      return null;
    }
    return r;
  }

  async begin(key: string, fingerprint: string): Promise<boolean> {
    if (await this.get(key)) return false;
    this.records.set(key, { state: "in_progress", fingerprint, expiresAt: this.opts.now() + this.opts.ttlMs });
    return true;
  }

  async complete(key: string, response: StoredResponse): Promise<void> {
    const r = this.records.get(key);
    if (!r) return;
    this.records.set(key, { state: "completed", fingerprint: r.fingerprint, expiresAt: r.expiresAt, response });
  }

  async release(key: string): Promise<void> {
    this.records.delete(key);
  }
}
