import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TimeoutError, withTimeout } from "../src/lib/withTimeout.js";

/** Tracks a promise's state without awaiting it, so a hanging promise can't hang the test. */
function track<T>(promise: Promise<T>) {
  const state: { status: "pending" | "fulfilled" | "rejected"; value?: T; reason?: unknown } = { status: "pending" };
  promise.then(
    (value) => Object.assign(state, { status: "fulfilled", value }),
    (reason: unknown) => Object.assign(state, { status: "rejected", reason }),
  );
  return state;
}

describe("withTimeout", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("passes through a result that arrives in time", async () => {
    const state = track(withTimeout(async () => 42, 1000));
    await vi.advanceTimersByTimeAsync(0);
    expect(state).toEqual({ status: "fulfilled", value: 42 });
  });

  it("passes through an error that arrives in time", async () => {
    const boom = new Error("boom");
    const state = track(withTimeout(async () => Promise.reject(boom), 1000));
    await vi.advanceTimersByTimeAsync(0);
    expect(state).toEqual({ status: "rejected", reason: boom });
  });

  it("rejects with TimeoutError at the deadline even if the operation ignores the signal", async () => {
    const state = track(withTimeout(() => new Promise<never>(() => {}), 1000));
    await vi.advanceTimersByTimeAsync(999);
    expect(state.status, "too early").toBe("pending");
    await vi.advanceTimersByTimeAsync(1);
    expect(state.status, "the operation never settles, so withTimeout itself must reject at 1000ms").toBe("rejected");
    expect(state.reason).toBeInstanceOf(TimeoutError);
    expect((state.reason as TimeoutError).ms).toBe(1000);
  });

  it("aborts the signal it handed to the operation when the deadline passes", async () => {
    let seen: AbortSignal | undefined;
    track(
      withTimeout((signal) => {
        seen = signal;
        return new Promise<never>(() => {});
      }, 500),
    );
    expect(seen?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(500);
    expect(seen?.aborted, "the operation should be told to stop").toBe(true);
    expect(seen?.reason).toBeInstanceOf(TimeoutError);
  });

  it("rejects with TimeoutError (not a generic AbortError) when the operation honors the signal", async () => {
    const state = track(
      withTimeout(
        (signal) =>
          new Promise<never>((_, reject) => signal.addEventListener("abort", () => reject(new Error("AbortError")))),
        300,
      ),
    );
    await vi.advanceTimersByTimeAsync(300);
    expect(state.reason).toBeInstanceOf(TimeoutError);
  });

  it("does not leave a timer behind after a fast success", async () => {
    const state = track(withTimeout(async () => "fast", 60_000));
    await vi.advanceTimersByTimeAsync(0);
    expect(state.status).toBe("fulfilled");
    expect(vi.getTimerCount(), "a pending 60s timer would keep the process alive").toBe(0);
  });
});
