/**
 * THE CONTRACT between your code and the acceptance tests.
 * Don't change this file. Everything else in src/ is yours to design.
 *
 * The tests only ever call `createSystem(options)` from src/system.ts and
 * talk to the returned Express app over HTTP (supertest).
 */
import type { Express } from "express";

/** What a fetcher extracts from a page. */
export interface LinkMetadata {
  title: string;
  description: string | null;
  imageUrl: string | null;
}

/**
 * Downloads a URL and extracts its metadata. Injected so tests can use a fake
 * that is slow, flaky or broken on demand. Implementations throw:
 * - PermanentFetchError when retrying can't help (404, not HTML, blocked host...)
 * - any other Error for transient problems (timeouts, 5xx), which SHOULD be retried
 */
export interface MetadataFetcher {
  fetch(url: string): Promise<LinkMetadata>;
}

export class PermanentFetchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PermanentFetchError";
  }
}

export interface SystemOptions {
  databaseUrl: string;
  redisUrl: string;
  /**
   * Isolates one running system from another sharing the same Redis:
   * EVERY Redis key you create (cache, rate limits, BullMQ via its `prefix`
   * option, dedupe markers...) must start with `wl:21:${namespace}:`.
   * Tests use a fresh namespace per test and delete those keys afterwards.
   */
  namespace: string;
  fetcher: MetadataFetcher;
  /** Valid values for the X-API-Key header. */
  apiKeys: string[];
  /** Per-API-key limit on all /previews routes. */
  rateLimit: { limit: number; windowMs: number };
  /** TTL of cached ready previews in Redis. */
  cacheTtlSeconds: number;
  /** Fetch job retry policy: total attempts and the base backoff delay. */
  jobs: { attempts: number; backoffMs: number };
}

export interface System {
  /** The HTTP app. The worker(s) are already running when createSystem resolves. */
  app: Express;
  /**
   * Graceful shutdown: stop workers (waiting for active jobs), close queues,
   * Redis connections and the Postgres pool. Must be safe to call twice.
   */
  close(): Promise<void>;
}

/** Wire format of a preview (the `data` field of responses). */
export type PreviewDto =
  | {
      url: string;
      status: "ready";
      title: string;
      description: string | null;
      imageUrl: string | null;
      fetchedAt: string; // ISO 8601
    }
  | { url: string; status: "failed"; error: string; fetchedAt: string }
  | { url: string; status: "pending"; jobId: string };
