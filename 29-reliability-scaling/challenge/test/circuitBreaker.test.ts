import { describe, expect, it, vi } from "vitest";
import { CircuitBreaker, type BreakerState } from "../src/resilience/circuitBreaker.js";
import { CircuitOpenError } from "../src/resilience/errors.js";
import { deferred } from "./helpers/deferred.js";

function setup(overrides: Partial<ConstructorParameters<typeof CircuitBreaker>[0]> = {}) {
  let now = 1_000_000;
  const transitions: Array<[BreakerState, BreakerState]> = [];
  const breaker = new CircuitBreaker({
    failureThreshold: 3,
    resetTimeoutMs: 5_000,
    now: () => now,
    onStateChange: (from, to) => transitions.push([from, to]),
    ...overrides,
  });
  return {
    breaker,
    transitions,
    advance: (ms: number) => {
      now += ms;
    },
  };
}

const ok = () => Promise.resolve("ok");
const boom = () => Promise.reject(new Error("boom"));

async function failTimes(breaker: CircuitBreaker, n: number) {
  for (let i = 0; i < n; i++) await breaker.execute(boom).catch(() => {});
}

describe("CircuitBreaker (TODO 4)", () => {
  it("starts closed and passes results and errors through", async () => {
    const { breaker } = setup();
    expect(breaker.state).toBe("closed");
    await expect(breaker.execute(ok)).resolves.toBe("ok");
    await expect(breaker.execute(boom)).rejects.toThrow("boom");
  });

  it("opens after failureThreshold CONSECUTIVE failures", async () => {
    const { breaker } = setup();
    await failTimes(breaker, 2);
    await breaker.execute(ok); // a success resets the count
    await failTimes(breaker, 2);
    expect(breaker.state).toBe("closed");
    await failTimes(breaker, 1);
    expect(breaker.state).toBe("open");
  });

  it("fails fast while open, without calling fn, with CircuitOpenError", async () => {
    const { breaker, advance } = setup();
    await failTimes(breaker, 3);
    advance(1_000);
    const fn = vi.fn(ok);
    const error = await breaker.execute(fn).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(CircuitOpenError);
    expect((error as CircuitOpenError).retryAfterMs).toBe(4_000);
    expect(fn).not.toHaveBeenCalled();
  });

  it("becomes half_open after resetTimeoutMs", async () => {
    const { breaker, advance } = setup();
    await failTimes(breaker, 3);
    advance(4_999);
    expect(breaker.state).toBe("open");
    advance(1);
    expect(breaker.state).toBe("half_open");
  });

  it("closes again when the half-open trial succeeds", async () => {
    const { breaker, advance, transitions } = setup();
    await failTimes(breaker, 3);
    advance(5_000);
    await expect(breaker.execute(ok)).resolves.toBe("ok");
    expect(breaker.state).toBe("closed");
    expect(transitions).toEqual([
      ["closed", "open"],
      ["open", "half_open"],
      ["half_open", "closed"],
    ]);
  });

  it("re-opens (and restarts the timer) when the half-open trial fails", async () => {
    const { breaker, advance } = setup();
    await failTimes(breaker, 3);
    advance(5_000);
    await breaker.execute(boom).catch(() => {});
    expect(breaker.state).toBe("open");
    advance(4_999);
    expect(breaker.state, "timer restarts from the failed trial").toBe("open");
    advance(1);
    expect(breaker.state).toBe("half_open");
  });

  it("lets only ONE trial call through while half-open", async () => {
    const { breaker, advance } = setup();
    await failTimes(breaker, 3);
    advance(5_000);
    const trial = deferred<string>();
    const first = breaker.execute(() => trial.promise);
    const second = vi.fn(ok);
    await expect(breaker.execute(second)).rejects.toBeInstanceOf(CircuitOpenError);
    expect(second).not.toHaveBeenCalled();
    trial.resolve("ok");
    await expect(first).resolves.toBe("ok");
    expect(breaker.state).toBe("closed");
  });

  it("does not count errors that isFailure rejects (e.g. 404s)", async () => {
    const notFound = new Error("not found");
    const { breaker } = setup({ isFailure: (e) => e !== notFound });
    for (let i = 0; i < 10; i++) await breaker.execute(() => Promise.reject(notFound)).catch(() => {});
    expect(breaker.state).toBe("closed");
  });

  it("counts a timeout-style hang as a failure only when it rejects", async () => {
    const { breaker } = setup({ failureThreshold: 1 });
    const pending = deferred<string>();
    const call = breaker.execute(() => pending.promise);
    expect(breaker.state).toBe("closed");
    pending.reject(new Error("timeout"));
    await call.catch(() => {});
    expect(breaker.state).toBe("open");
  });
});
