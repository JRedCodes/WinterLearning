import { afterEach, describe, expect, it, vi } from "vitest";
import { backoffDelay, retry } from "../src/resilience/retry.js";
import { RetryBudget } from "../src/resilience/retryBudget.js";

/** A fn that fails `failures` times, then returns "ok". */
function flaky(failures: number, error: unknown = new Error("flaky")) {
  const fn = vi.fn(async (_attempt: number) => {
    if (fn.mock.calls.length <= failures) throw error;
    return "ok";
  });
  return fn;
}

const recordSleep = () => {
  const delays: number[] = [];
  return { delays, sleep: async (ms: number) => void delays.push(ms) };
};

describe("backoffDelay (TODO 2)", () => {
  const base = { baseDelayMs: 100, maxDelayMs: 1_000 };

  it("doubles per attempt without jitter: 100, 200, 400, 800", () => {
    expect([1, 2, 3, 4].map((a) => backoffDelay(a, { ...base, jitter: "none" }))).toEqual([100, 200, 400, 800]);
  });

  it("caps at maxDelayMs", () => {
    expect(backoffDelay(5, { ...base, jitter: "none" })).toBe(1_000);
    expect(backoffDelay(30, { ...base, jitter: "none" })).toBe(1_000);
  });

  it("uses full jitter by default: floor(random() * capped)", () => {
    expect(backoffDelay(3, { ...base, random: () => 0.5 })).toBe(200);
    expect(backoffDelay(3, { ...base, random: () => 0 })).toBe(0);
    expect(backoffDelay(3, { ...base, random: () => 0.999 })).toBe(399);
    expect(backoffDelay(10, { ...base, random: () => 0.25 })).toBe(250);
  });
});

describe("retry (TODO 2)", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns the first successful result without retrying", async () => {
    const fn = flaky(0);
    await expect(retry(fn, { attempts: 3, baseDelayMs: 10, maxDelayMs: 100 })).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries until success, passing the attempt number", async () => {
    const fn = flaky(2);
    const { sleep } = recordSleep();
    await expect(retry(fn, { attempts: 3, baseDelayMs: 10, maxDelayMs: 100, sleep })).resolves.toBe("ok");
    expect(fn.mock.calls.map((c) => c[0])).toEqual([1, 2, 3]);
  });

  it("gives up after `attempts` and rethrows the last error unchanged", async () => {
    const error = new Error("still down");
    const fn = flaky(10, error);
    const { sleep } = recordSleep();
    await expect(retry(fn, { attempts: 4, baseDelayMs: 10, maxDelayMs: 100, sleep })).rejects.toBe(error);
    expect(fn).toHaveBeenCalledTimes(4);
  });

  it("does not retry errors that retryOn rejects", async () => {
    const fatal = new Error("404");
    const fn = flaky(10, fatal);
    const { sleep } = recordSleep();
    await expect(
      retry(fn, { attempts: 5, baseDelayMs: 10, maxDelayMs: 100, sleep, retryOn: (e) => e !== fatal }),
    ).rejects.toBe(fatal);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("sleeps with exponential backoff + jitter between attempts (not after the last one)", async () => {
    const fn = flaky(10);
    const { delays, sleep } = recordSleep();
    await retry(fn, { attempts: 4, baseDelayMs: 100, maxDelayMs: 250, random: () => 0.5, sleep }).catch(() => {});
    expect(delays).toEqual([50, 100, 125]);
  });

  it("calls onRetry before each retry", async () => {
    const onRetry = vi.fn();
    const { sleep } = recordSleep();
    await retry(flaky(2), { attempts: 3, baseDelayMs: 10, maxDelayMs: 100, jitter: "none", sleep, onRetry });
    expect(onRetry.mock.calls.map((c) => [c[0].attempt, c[0].delayMs])).toEqual([
      [1, 10],
      [2, 20],
    ]);
  });

  it("stops retrying when the retry budget is exhausted", async () => {
    const budget = new RetryBudget({ maxTokens: 2, tokenRatio: 0.5 });
    const { sleep } = recordSleep();
    const fn = flaky(100);
    await retry(fn, { attempts: 10, baseDelayMs: 1, maxDelayMs: 1, sleep, budget }).catch(() => {});
    expect(fn, "1 attempt + 2 budgeted retries").toHaveBeenCalledTimes(3);
    const second = flaky(100);
    await retry(second, { attempts: 10, baseDelayMs: 1, maxDelayMs: 1, sleep, budget }).catch(() => {});
    expect(second, "budget empty: no retries at all").toHaveBeenCalledTimes(1);
  });

  it("refills the budget on success", async () => {
    const budget = new RetryBudget({ maxTokens: 1, tokenRatio: 0.5 });
    const { sleep } = recordSleep();
    expect(budget.tryAcquire()).toBe(true);
    await retry(flaky(0), { attempts: 3, baseDelayMs: 1, maxDelayMs: 1, sleep, budget });
    await retry(flaky(0), { attempts: 3, baseDelayMs: 1, maxDelayMs: 1, sleep, budget });
    expect(budget.available).toBeCloseTo(1);
  });

  it("uses real timers by default (works with fake timers)", async () => {
    vi.useFakeTimers();
    const fn = flaky(1);
    const result = retry(fn, { attempts: 2, baseDelayMs: 1_000, maxDelayMs: 1_000, jitter: "none" });
    await vi.advanceTimersByTimeAsync(999);
    expect(fn).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    await expect(result).resolves.toBe("ok");
  });
});
