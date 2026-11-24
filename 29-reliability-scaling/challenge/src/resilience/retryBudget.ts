export interface RetryBudgetOptions {
  /** Tokens available at start and the maximum that can accumulate. */
  maxTokens: number;
  /** Tokens earned per successful call, e.g. 0.1 = at most 1 retry per 10 successes in the long run. */
  tokenRatio: number;
}

/**
 * Caps retries as a fraction of successful traffic.
 *
 * Per-call retry limits ("3 attempts") still multiply load by 3x when a
 * downstream is struggling, which is exactly when it can least afford it.
 * A budget makes retries a scarce, shared resource: when most calls fail,
 * the bucket empties and the client stops retrying altogether.
 *
 * TODO(3):
 * - Start with maxTokens tokens.
 * - recordSuccess(): add tokenRatio, never above maxTokens.
 * - tryAcquire(): if at least 1 token, take it and return true; else false.
 * - available: the current (possibly fractional) token count.
 */
export class RetryBudget {
  constructor(private readonly options: RetryBudgetOptions) {}

  recordSuccess(): void {
    throw new Error("Not implemented");
  }

  tryAcquire(): boolean {
    throw new Error("Not implemented");
  }

  get available(): number {
    throw new Error("Not implemented");
  }
}
