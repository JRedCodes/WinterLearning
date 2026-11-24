import { describe, expect, it } from "vitest";
import { RetryBudget } from "../src/resilience/retryBudget.js";

describe("RetryBudget (TODO 3)", () => {
  it("starts full and hands out one token per retry", () => {
    const budget = new RetryBudget({ maxTokens: 3, tokenRatio: 0.1 });
    expect([budget.tryAcquire(), budget.tryAcquire(), budget.tryAcquire(), budget.tryAcquire()]).toEqual([
      true,
      true,
      true,
      false,
    ]);
  });

  it("earns tokenRatio per success, so retries are a fraction of successful traffic", () => {
    const budget = new RetryBudget({ maxTokens: 5, tokenRatio: 0.25 });
    while (budget.tryAcquire()) {
      /* drain */
    }
    for (let i = 0; i < 3; i++) budget.recordSuccess();
    expect(budget.tryAcquire(), "0.75 tokens is not enough").toBe(false);
    budget.recordSuccess();
    expect(budget.tryAcquire(), "4 successes x 0.25 = 1 retry").toBe(true);
    expect(budget.tryAcquire()).toBe(false);
  });

  it("never grows above maxTokens", () => {
    const budget = new RetryBudget({ maxTokens: 2, tokenRatio: 1 });
    for (let i = 0; i < 100; i++) budget.recordSuccess();
    expect(budget.available).toBe(2);
  });
});
