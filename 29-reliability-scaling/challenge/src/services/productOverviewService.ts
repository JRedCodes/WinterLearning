import { NotFoundError } from "../domain/errors.js";
import type { OverviewResult, ServiceName } from "../domain/product.js";
import type { Downstreams } from "../downstream/clients.js";
import type { Policies } from "../policies.js";
import type { BreakerState } from "../resilience/circuitBreaker.js";

export interface ProductOverviewDeps {
  downstreams: Downstreams;
  policies: Policies;
  /** Injected clock for breakers and the price cache. Default Date.now. */
  now?: () => number;
  /** Injected randomness for jitter. Default Math.random. */
  random?: () => number;
  /** How old a cached price may be and still be served when pricing is down. Default 1h. */
  stalePriceMaxAgeMs?: number;
}

/**
 * Builds the product page from three downstreams.
 *
 * ⚠️ This is the code that caused last week's incident (see CHALLENGE.md).
 * It works perfectly as long as every downstream is fast and healthy.
 *
 * TODO(6): make it resilient, using the primitives from TODO 1–5 and the
 * per-service numbers in `this.deps.policies`:
 *
 *   - call the three downstreams in parallel
 *   - every call: retry(with backoff + jitter + budget) → circuit breaker → bulkhead → timeout
 *     (one CircuitBreaker, Bulkhead and RetryBudget per downstream, created once)
 *   - retry only transient errors (timeouts, DownstreamError 5xx/429/status 0); never
 *     NotFoundError, CircuitOpenError or BulkheadFullError
 *   - breakers must not count NotFoundError (or BulkheadFullError) as failures
 *   - fallbacks:
 *       catalog fails  → NotFoundError passes through (404); anything else →
 *                        UpstreamUnavailableError("catalog", retryAfterSeconds) (503)
 *       pricing fails  → last known good price for this id (stale: true), else null
 *                        (src/lib/lastKnownGood.ts is ready for you)
 *       reviews fail   → null
 *   - degraded: true and the failed services in `unavailable` when anything failed
 *   - breakerStates(): the real state of each downstream's breaker
 */
export class ProductOverviewService {
  constructor(private readonly deps: ProductOverviewDeps) {}

  async getOverview(id: string): Promise<OverviewResult> {
    const { catalog, pricing, reviews } = this.deps.downstreams;
    const signal = new AbortController().signal; // nobody ever aborts this

    const product = await retryForever(() => catalog.getProduct(id, signal));
    const price = await retryForever(() => pricing.getPrice(id, signal));
    const reviewSummary = await retryForever(() => reviews.getReviews(id, signal));

    return {
      data: { product, price: { ...price, stale: false }, reviews: reviewSummary },
      degraded: false,
      unavailable: [],
    };
  }

  breakerStates(): Record<ServiceName, BreakerState> {
    return { catalog: "closed", pricing: "closed", reviews: "closed" };
  }
}

/** "The network is flaky, so just try again until it works." */
async function retryForever<T>(fn: () => Promise<T>): Promise<T> {
  for (;;) {
    try {
      return await fn();
    } catch (err) {
      if (err instanceof NotFoundError) throw err;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }
}
