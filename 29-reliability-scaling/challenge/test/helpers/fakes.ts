import { DownstreamError, NotFoundError } from "../../src/domain/errors.js";
import type { Price, Product, ReviewSummary, ServiceName } from "../../src/domain/product.js";
import type { Downstreams } from "../../src/downstream/clients.js";
import type { Policies } from "../../src/policies.js";

/**
 * How a fake downstream behaves on its next calls:
 *   ok        resolves after `latencyMs`
 *   fail      rejects with DownstreamError(503) after `latencyMs`
 *   notfound  rejects with NotFoundError after `latencyMs`
 *   hang      never settles (until aborted): the worst kind of failure
 */
export type Behavior = "ok" | "fail" | "notfound" | "hang";

export class FakeService<T> {
  behavior: Behavior = "ok";
  latencyMs = 5;
  calls = 0;
  inFlight = 0;
  maxInFlight = 0;
  /** Calls whose AbortSignal fired (the caller gave up and told us). */
  aborted = 0;
  /** Behaviors to use for the next calls, before falling back to `behavior`. */
  script: Behavior[] = [];

  constructor(
    readonly name: ServiceName,
    private readonly value: (id: string) => T,
  ) {}

  call(id: string, signal: AbortSignal): Promise<T> {
    this.calls++;
    this.inFlight++;
    this.maxInFlight = Math.max(this.maxInFlight, this.inFlight);
    const behavior = this.script.shift() ?? this.behavior;
    return new Promise<T>((resolve, reject) => {
      let timer: NodeJS.Timeout | undefined;
      const done = () => {
        this.inFlight--;
        clearTimeout(timer);
      };
      signal.addEventListener(
        "abort",
        () => {
          this.aborted++;
          done();
          reject(signal.reason);
        },
        { once: true },
      );
      if (behavior === "hang") return;
      timer = setTimeout(() => {
        if (signal.aborted) return;
        done();
        if (behavior === "ok") resolve(this.value(id));
        else if (behavior === "notfound") reject(new NotFoundError("Product"));
        else reject(new DownstreamError(this.name, 503));
      }, this.latencyMs);
    });
  }
}

export function fakeDownstreams() {
  const catalog = new FakeService<Product>("catalog", (id) => ({ id, name: `Product ${id}`, description: "desc" }));
  const pricing = new FakeService<Price>("pricing", () => ({ amount: 1999, currency: "EUR" }));
  const reviews = new FakeService<ReviewSummary>("reviews", () => ({ average: 4.5, count: 10 }));
  const downstreams: Downstreams = {
    catalog: { getProduct: (id, signal) => catalog.call(id, signal) },
    pricing: { getPrice: (id, signal) => pricing.call(id, signal) },
    reviews: { getReviews: (id, signal) => reviews.call(id, signal) },
  };
  return { catalog, pricing, reviews, downstreams };
}

/** Small, fast policies for tests. Worst case per service: 3 x 100ms + 10 + 20ms backoff. */
export function testPolicies(): Policies {
  const base = {
    timeoutMs: 100,
    retry: { attempts: 3, baseDelayMs: 10, maxDelayMs: 40 },
    retryBudget: { maxTokens: 1000, tokenRatio: 0.1 },
    breaker: { failureThreshold: 5, resetTimeoutMs: 1_000 },
    bulkhead: { maxConcurrent: 4, maxQueue: 2 },
  };
  return {
    catalog: structuredClone(base),
    pricing: structuredClone(base),
    reviews: structuredClone(base),
  };
}
