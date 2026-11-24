# Challenge · Resilient Aggregator

**Type:** 🛠️ Build · **Est:** 4–5h · **Services:** none

## Scenario

> **INC-2291 postmortem, action items** · *Owner: you*
>
> **Summary.** On Tuesday at 14:02 the reviews service started answering in ~30 s instead of ~80 ms after a bad index migration. Within four minutes the product page (served by the `aggregator`) stopped responding entirely, even though reviews are an optional widget. Error rate on the storefront hit 100% for 23 minutes. The reviews team reverted at 14:25; the aggregator only recovered after a manual restart at 14:31.
>
> **What we found.** The aggregator calls catalog, pricing and reviews **one after another**, with **no timeouts**, and wraps each call in a `retryForever` helper with a fixed 50 ms delay. Requests piled up waiting on reviews until the process ran out of sockets and memory. Meanwhile every pod hammered the reviews service with immediate retries, which slowed its recovery.
>
> **Action items.**
> 1. Implement shared resilience primitives in `src/resilience/` (we want to reuse them in other services).
> 2. Rebuild `ProductOverviewService` on top of them so a failing dependency degrades the page instead of taking it down.
> 3. Document the policy choices.

## Your task

| TODO | File | What | Tests |
|---|---|---|---|
| 1 | `src/resilience/timeout.ts` | `withTimeout(fn, ms)`: deadline + AbortSignal cancellation | `timeout.test.ts` |
| 2 | `src/resilience/retry.ts` | `backoffDelay` (exponential, capped, full jitter) and `retry` (retryOn, budget, injected sleep) | `retry.test.ts` |
| 3 | `src/resilience/retryBudget.ts` | `RetryBudget`: retries as a fraction of successes | `retryBudget.test.ts` |
| 4 | `src/resilience/circuitBreaker.ts` | `CircuitBreaker`: closed / open / half-open with an injected clock | `circuitBreaker.test.ts` |
| 5 | `src/resilience/bulkhead.ts` | `Bulkhead(maxConcurrent, maxQueue)`: concurrency limit + load shedding | `bulkhead.test.ts` |
| 6 | `src/services/productOverviewService.ts` | Replace the naive code: parallel calls, the policy stack, fallbacks, `degraded` | `overview.service.test.ts`, `api.test.ts` |

Then fill in `challenge/DECISIONS.md`.

The primitives (TODO 1–5) are independent and generic: no product, no Express, no domain types. The service (TODO 6) composes them using the per-service numbers in `src/policies.ts`.

### The response contract

```json
GET /products/p-1/overview
200 {
  "data": {
    "product": { "id": "p-1", "name": "...", "description": "..." },
    "price": { "amount": 1999, "currency": "EUR", "stale": false },
    "reviews": { "average": 4.5, "count": 10 }
  },
  "degraded": false,
  "unavailable": []
}
```

| Situation | Response |
|---|---|
| everything healthy | 200, `degraded: false` |
| pricing fails, we've seen this product's price before | 200, `price.stale: true`, `degraded: true`, `unavailable: ["pricing"]` |
| pricing fails, no cached price | 200, `price: null`, `degraded: true` |
| reviews fail (error, hang, open breaker, full bulkhead) | 200, `reviews: null`, `degraded: true` |
| catalog says the product doesn't exist | 404 `PRODUCT_NOT_FOUND` (not retried, doesn't trip the breaker) |
| catalog fails | 503 `UPSTREAM_UNAVAILABLE` with a `Retry-After` header |

`GET /health/dependencies` returns `{ "breakers": { "catalog": "closed", ... } }`. `GET /health` is liveness only.

## Acceptance criteria

- [ ] `withTimeout` resolves/rejects with fn's outcome, rejects with `TimeoutError` at the deadline, aborts fn's signal, never leaks a timer (`timeout.test.ts`)
- [ ] `backoffDelay` is exponential, capped, and uses full jitter by default; `retry` honours attempts, `retryOn`, the budget, `onRetry`, and rethrows the last error unchanged (`retry.test.ts`)
- [ ] `RetryBudget` starts full, earns `tokenRatio` per success, caps at `maxTokens` (`retryBudget.test.ts`)
- [ ] `CircuitBreaker` opens after N consecutive failures, fails fast while open, goes half-open after the reset timeout, allows one trial, closes or re-opens; `isFailure` filters what counts (`circuitBreaker.test.ts`)
- [ ] `Bulkhead` caps concurrency, queues FIFO up to `maxQueue`, rejects the rest with `BulkheadFullError`, frees slots on failure (`bulkhead.test.ts`)
- [ ] The overview calls downstreams in parallel, never hangs on a hung dependency, cancels timed-out calls, retries only transient errors a bounded number of times (`overview.service.test.ts`)
- [ ] Breakers open per downstream, stop traffic and retries while open, recover via half-open; 404s don't trip them
- [ ] A bulkhead per downstream sheds excess calls without retrying them
- [ ] Fallbacks and the response contract above, over HTTP (`api.test.ts`)
- [ ] `DECISIONS.md` is filled in
- [ ] `npm test` and `npm run typecheck` pass

## Getting started

```bash
cd 29-reliability-scaling/challenge
make install
make test        # most tests fail; the API tests that hang time out after 3s
make dev         # the aggregator with simulated flaky downstreams
```

Reproduce the incident by hand (with the starter code):

```bash
REVIEWS_LATENCY_MS=30000 npm run dev
time curl -s localhost:3000/products/p-1/overview    # ...waits ~30s+, per request
```

After TODO 6 the same command answers in well under a second with `"degraded": true`.

Optional, if you have [k6](https://grafana.com/docs/k6/latest/set-up/install-k6/) installed: `make load` runs `k6/load.js` with SLO thresholds. `deploy/nginx.conf` shows how you'd balance two instances. Neither is needed for the tests.

## Rules

- Don't modify the tests or `test/helpers/`.
- No resilience libraries (no `opossum`, `cockatiel`, `p-retry`...). Building them once is the point.
- `src/resilience/` must stay generic: it must not import from `domain/`, `services/` or Express.
- Use the injected `now`/`random` from the service deps (the tests control time with fake timers).

## DECISIONS.md

Record your policy choices: the composition order and why, per-downstream numbers with the latency budget arithmetic, what counts as a breaker failure, and the fallback per dependency. Note what you'd monitor and alert on.

## Stretch goals

1. **Overall deadline:** give `getOverview` a total budget (e.g. 800 ms) and pass the remaining time down, so retries never push the page past it. Hint: `AbortSignal.any`.
2. **Sliding-window breaker:** open when ≥ 50% of the last 20 calls failed (minimum 10 calls), instead of consecutive failures.
3. **Load-shedding middleware:** reject with 503 when in-flight requests exceed a limit or event loop delay p99 exceeds 100 ms (`perf_hooks.monitorEventLoopDelay`).
4. **Hedged reviews request:** if reviews hasn't answered by 60 ms, fire a second call and take the first answer.
5. **Metrics:** expose breaker state, retries, sheds and degraded responses with `prom-client` (module 24).
6. **Run the load test** against the starter and your solution with `PRICING_LATENCY_MS=2000` and paste both k6 summaries into `DECISIONS.md`.

## Done?

1. `npm test` is green and `npm run typecheck` is clean.
2. Commit on your branch `module/29-reliability-scaling`, push and open a PR. CI runs this module's tests.
3. From the repo root: `npm run progress -- 29` to tick it off on the roadmap.
4. Answer the questions in [INTERVIEW.md](INTERVIEW.md).
5. Add an entry to [LOG.md](../LOG.md).
6. Compare with the reference solution: `git diff main origin/solutions -- 29-reliability-scaling/` (and read `SOLUTION.md` on that branch).

Stuck? → [HINTS.md](HINTS.md)
