import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TimeoutError } from "../src/resilience/errors.js";
import { withTimeout } from "../src/resilience/timeout.js";

describe("withTimeout (TODO 1)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("resolves with the result when fn is fast enough", async () => {
    const result = withTimeout(() => new Promise<string>((r) => setTimeout(() => r("done"), 50)), 100);
    await vi.advanceTimersByTimeAsync(50);
    await expect(result).resolves.toBe("done");
  });

  it("rejects with TimeoutError when fn takes too long", async () => {
    const result = withTimeout(() => new Promise<string>(() => {}), 100);
    const assertion = expect(result).rejects.toBeInstanceOf(TimeoutError);
    await vi.advanceTimersByTimeAsync(100);
    await assertion;
    await expect(result).rejects.toMatchObject({ timeoutMs: 100 });
  });

  it("does not time out early", async () => {
    let settled = false;
    const result = withTimeout(() => new Promise<string>(() => {}), 100).catch(() => {
      settled = true;
    });
    await vi.advanceTimersByTimeAsync(99);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await result;
    expect(settled).toBe(true);
  });

  it("aborts the signal it gave to fn when the deadline passes (so the work is cancelled)", async () => {
    let seen: AbortSignal | undefined;
    const result = withTimeout((signal) => {
      seen = signal;
      return new Promise<never>(() => {});
    }, 100).catch((e: unknown) => e);
    expect(seen?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(100);
    await result;
    expect(seen?.aborted).toBe(true);
    expect(seen?.reason).toBeInstanceOf(TimeoutError);
  });

  it("passes fn's own error through unchanged", async () => {
    const boom = new Error("boom");
    await expect(withTimeout(async () => Promise.reject(boom), 100)).rejects.toBe(boom);
  });

  it("turns a synchronous throw inside fn into a rejection", async () => {
    const boom = new Error("sync boom");
    const result = withTimeout(() => {
      throw boom;
    }, 100);
    await expect(result).rejects.toBe(boom);
  });

  it("clears its timer once fn settles (no leaked timers)", async () => {
    await withTimeout(async () => "fast", 10_000);
    expect(vi.getTimerCount()).toBe(0);
  });
});
