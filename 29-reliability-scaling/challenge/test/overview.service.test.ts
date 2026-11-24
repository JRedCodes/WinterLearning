import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NotFoundError, UpstreamUnavailableError } from "../src/domain/errors.js";
import type { OverviewResult } from "../src/domain/product.js";
import { ProductOverviewService } from "../src/services/productOverviewService.js";
import { fakeDownstreams, testPolicies } from "./helpers/fakes.js";

/**
 * The service under fake timers. testPolicies(): 100ms timeout per attempt,
 * 3 attempts, backoff 10/20ms (jitter disabled via random = 0.999...),
 * breaker opens after 5 consecutive failures for 1s, bulkhead 4 + queue 2.
 */
function setup(policies = testPolicies()) {
  const fakes = fakeDownstreams();
  const service = new ProductOverviewService({
    downstreams: fakes.downstreams,
    policies,
    random: () => 0.999999,
  });
  return { ...fakes, service };
}

/** Runs getOverview and advances fake time until it settles (or maxMs passes). */
async function settle(promise: Promise<OverviewResult>, maxMs = 5_000) {
  let outcome: { ok: true; value: OverviewResult } | { ok: false; error: unknown } | undefined;
  const started = Date.now();
  promise.then(
    (value) => (outcome = { ok: true, value }),
    (error: unknown) => (outcome = { ok: false, error }),
  );
  while (!outcome && Date.now() - started < maxMs) await vi.advanceTimersByTimeAsync(5);
  return { outcome, elapsedMs: Date.now() - started };
}

describe("ProductOverviewService (TODO 6)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns the full overview when everything is healthy", async () => {
    const { service } = setup();
    const { outcome } = await settle(service.getOverview("p-1"));
    expect(outcome).toEqual({
      ok: true,
      value: {
        data: {
          product: { id: "p-1", name: "Product p-1", description: "desc" },
          price: { amount: 1999, currency: "EUR", stale: false },
          reviews: { average: 4.5, count: 10 },
        },
        degraded: false,
        unavailable: [],
      },
    });
  });

  it("calls the three downstreams in parallel, not one after another", async () => {
    const { service, catalog, pricing, reviews } = setup();
    catalog.latencyMs = pricing.latencyMs = reviews.latencyMs = 80;
    const { outcome, elapsedMs } = await settle(service.getOverview("p-1"));
    expect(outcome?.ok).toBe(true);
    expect(elapsedMs, "3 x 80ms in sequence would be 240ms").toBeLessThan(150);
  });

  it("does not hang when a downstream hangs: times out and degrades (no cascading slowness)", async () => {
    const { service, reviews } = setup();
    reviews.behavior = "hang";
    const { outcome, elapsedMs } = await settle(service.getOverview("p-1"));
    expect(outcome, "getOverview never settled: is there a timeout on every call?").toBeDefined();
    expect(elapsedMs, "3 attempts x 100ms + backoff should finish well under 500ms").toBeLessThan(500);
    expect(outcome).toMatchObject({ ok: true, value: { degraded: true, unavailable: ["reviews"] } });
    if (outcome?.ok) expect(outcome.value.data.reviews).toBeNull();
  });

  it("cancels timed-out calls through the AbortSignal", async () => {
    const { service, reviews } = setup();
    reviews.behavior = "hang";
    await settle(service.getOverview("p-1"));
    expect(reviews.aborted).toBe(reviews.calls);
    expect(reviews.inFlight, "no downstream call should be left running").toBe(0);
  });

  it("retries transient failures with a bounded number of attempts", async () => {
    const { service, pricing } = setup();
    pricing.script = ["fail", "fail"]; // then ok
    const { outcome } = await settle(service.getOverview("p-1"));
    expect(pricing.calls).toBe(3);
    expect(outcome).toMatchObject({ ok: true, value: { degraded: false } });
  });

  it("does not retry forever: gives up after policy.retry.attempts", async () => {
    const { service, reviews } = setup();
    reviews.behavior = "fail";
    const { outcome } = await settle(service.getOverview("p-1"));
    expect(reviews.calls).toBe(3);
    expect(outcome).toMatchObject({ ok: true, value: { degraded: true, unavailable: ["reviews"] } });
  });

  it("returns 404-style NotFoundError without retrying (a 404 is not transient)", async () => {
    const { service, catalog } = setup();
    catalog.behavior = "notfound";
    const { outcome } = await settle(service.getOverview("p-404"));
    expect(outcome?.ok).toBe(false);
    if (outcome && !outcome.ok) expect(outcome.error).toBeInstanceOf(NotFoundError);
    expect(catalog.calls).toBe(1);
  });

  it("fails with UpstreamUnavailableError when the catalog (required) is down", async () => {
    const { service, catalog } = setup();
    catalog.behavior = "fail";
    const { outcome } = await settle(service.getOverview("p-1"));
    expect(outcome?.ok).toBe(false);
    if (outcome && !outcome.ok) {
      expect(outcome.error).toBeInstanceOf(UpstreamUnavailableError);
      expect((outcome.error as UpstreamUnavailableError).retryAfterSeconds).toBeGreaterThanOrEqual(1);
    }
  });

  it("serves the last known price (stale: true) when pricing fails, or null if there is none", async () => {
    const { service, pricing } = setup();
    pricing.behavior = "fail";
    const first = await settle(service.getOverview("p-2"));
    expect(first.outcome).toMatchObject({ ok: true, value: { data: { price: null }, degraded: true, unavailable: ["pricing"] } });

    pricing.behavior = "ok";
    await settle(service.getOverview("p-1")); // caches p-1's price
    pricing.behavior = "fail";
    const { outcome } = await settle(service.getOverview("p-1"));
    expect(outcome).toMatchObject({
      ok: true,
      value: { data: { price: { amount: 1999, currency: "EUR", stale: true } }, degraded: true, unavailable: ["pricing"] },
    });
  });

  it("lists every failed service in `unavailable`, in catalog/pricing/reviews order", async () => {
    const { service, pricing, reviews } = setup();
    pricing.behavior = "fail";
    reviews.behavior = "hang";
    const { outcome } = await settle(service.getOverview("p-1"));
    expect(outcome).toMatchObject({ ok: true, value: { unavailable: ["pricing", "reviews"] } });
  });

  it("opens the circuit after repeated failures and then stops calling the downstream", async () => {
    const { service, reviews } = setup();
    reviews.behavior = "fail";
    // 5 consecutive failures open the breaker: that's 2 requests (3 attempts each, the 6th is rejected by the open breaker).
    await settle(service.getOverview("p-1"));
    await settle(service.getOverview("p-1"));
    expect(service.breakerStates().reviews).toBe("open");
    const callsWhenOpen = reviews.calls;

    const { outcome, elapsedMs } = await settle(service.getOverview("p-1"));
    expect(reviews.calls, "an open breaker must not call the downstream").toBe(callsWhenOpen);
    expect(elapsedMs, "an open breaker fails fast").toBeLessThan(50);
    expect(outcome).toMatchObject({ ok: true, value: { degraded: true, unavailable: ["reviews"] } });
  });

  it("does not retry while the circuit is open (CircuitOpenError is not retryable)", async () => {
    const { service, reviews } = setup();
    reviews.behavior = "fail";
    await settle(service.getOverview("p-1"));
    await settle(service.getOverview("p-1"));
    const calls = reviews.calls;
    expect(calls, "retries must stop as soon as the breaker opens").toBe(5);
  });

  it("lets a trial call through after the reset timeout and closes on success", async () => {
    const { service, reviews } = setup();
    reviews.behavior = "fail";
    await settle(service.getOverview("p-1"));
    await settle(service.getOverview("p-1"));
    expect(service.breakerStates().reviews).toBe("open");

    reviews.behavior = "ok";
    await vi.advanceTimersByTimeAsync(1_000);
    expect(service.breakerStates().reviews).toBe("half_open");
    const { outcome } = await settle(service.getOverview("p-1"));
    expect(outcome).toMatchObject({ ok: true, value: { degraded: false } });
    expect(service.breakerStates().reviews).toBe("closed");
  });

  it("does not let 404s open the catalog circuit", async () => {
    const { service, catalog } = setup();
    catalog.behavior = "notfound";
    for (let i = 0; i < 10; i++) await settle(service.getOverview("p-404"));
    expect(service.breakerStates().catalog).toBe("closed");
  });

  it("caps concurrent calls per downstream with a bulkhead and sheds the excess", async () => {
    const policies = testPolicies();
    policies.catalog.bulkhead = { maxConcurrent: 50, maxQueue: 50 };
    policies.reviews.bulkhead = { maxConcurrent: 50, maxQueue: 50 };
    const { service, pricing } = setup(policies);
    pricing.latencyMs = 50;
    const results = await Promise.all(Array.from({ length: 20 }, () => settle(service.getOverview("p-1"))));
    expect(pricing.maxInFlight, "bulkhead maxConcurrent is 4").toBeLessThanOrEqual(4);
    const shed = results.filter((r) => r.outcome?.ok && r.outcome.value.unavailable.includes("pricing"));
    expect(shed.length, "with 4 running + 2 queued, the other 14 requests are shed").toBe(14);
    expect(pricing.calls, "shed calls are not retried").toBe(6);
  });

  it("exposes breaker states for all three downstreams", () => {
    const { service } = setup();
    expect(service.breakerStates()).toEqual({ catalog: "closed", pricing: "closed", reviews: "closed" });
  });
});
