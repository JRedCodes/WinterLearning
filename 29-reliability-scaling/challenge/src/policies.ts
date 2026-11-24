import type { ServiceName } from "./domain/product.js";

export interface ServicePolicy {
  /** Per-attempt timeout. */
  timeoutMs: number;
  retry: { attempts: number; baseDelayMs: number; maxDelayMs: number };
  retryBudget: { maxTokens: number; tokenRatio: number };
  breaker: { failureThreshold: number; resetTimeoutMs: number };
  bulkhead: { maxConcurrent: number; maxQueue: number };
}

export type Policies = Record<ServiceName, ServicePolicy>;

/**
 * Production defaults. The numbers are a latency BUDGET: the page should
 * answer within ~1s even in the worst case. For pricing:
 *   3 attempts x 250ms timeout + up to (50 + 100)ms backoff ≈ 900ms.
 * Reviews are optional, so they get one retry and a tighter timeout: we'd
 * rather drop them than make the page slow.
 */
export const defaultPolicies: Policies = {
  catalog: {
    timeoutMs: 300,
    retry: { attempts: 3, baseDelayMs: 50, maxDelayMs: 200 },
    retryBudget: { maxTokens: 20, tokenRatio: 0.1 },
    breaker: { failureThreshold: 10, resetTimeoutMs: 10_000 },
    bulkhead: { maxConcurrent: 50, maxQueue: 50 },
  },
  pricing: {
    timeoutMs: 250,
    retry: { attempts: 3, baseDelayMs: 50, maxDelayMs: 200 },
    retryBudget: { maxTokens: 20, tokenRatio: 0.1 },
    breaker: { failureThreshold: 10, resetTimeoutMs: 10_000 },
    bulkhead: { maxConcurrent: 30, maxQueue: 30 },
  },
  reviews: {
    timeoutMs: 150,
    retry: { attempts: 2, baseDelayMs: 25, maxDelayMs: 100 },
    retryBudget: { maxTokens: 10, tokenRatio: 0.1 },
    breaker: { failureThreshold: 5, resetTimeoutMs: 15_000 },
    bulkhead: { maxConcurrent: 20, maxQueue: 0 },
  },
};
