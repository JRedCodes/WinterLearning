# Reliability cheat sheet

## The patterns in one table

| Pattern | Protects against | Key settings | Pitfall |
|---|---|---|---|
| Timeout | waiting forever | from the latency budget; shorter deeper in the stack | not cancelling the underlying work |
| Retry | transient failures | 2–3 attempts, only idempotent + transient errors | amplification across layers |
| Backoff + jitter | synchronized retry storms | base, cap, full jitter | no cap → absurd delays |
| Retry budget | retrying a failing dependency into the ground | ~10% of successes | none, really; use one |
| Circuit breaker | wasting time on a known-bad dependency; letting it recover | threshold, reset timeout, what counts as failure | counting 4xx as failures |
| Bulkhead | one dependency consuming all capacity | max concurrent, max queue | unbounded queue = no bulkhead |
| Load shedding | accepting more work than you can do | in-flight limit, loop lag | shedding too late (after the work is queued) |
| Fallback | all-or-nothing responses | per-field business decision | fallback paths that are never tested |
| Health checks | routing to dead instances | liveness = process only | liveness that checks dependencies |

## Formulas

```
Little's law:       in_flight = arrival_rate × latency
Backoff (full jitter): delay = random(0, min(cap, base × 2^(attempt−1)))
Worst-case latency: attempts × timeout + Σ backoff caps
Retry amplification: attempts_per_layer ^ layers
Queueing (M/M/1):   time_in_system ≈ service_time / (1 − utilization)
Availability of N serial deps: product of their availabilities (99.9%³ ≈ 99.7%)
Error budget:       (1 − SLO) × period   (99.9% / 30d ≈ 43 min)
```

## Retry decision table

| Error | Retry? |
|---|---|
| Timeout, ECONNRESET, ECONNREFUSED | ✅ (if idempotent) |
| 500, 502, 503, 504 | ✅ (if idempotent) |
| 429 | ✅ after `Retry-After` |
| 400, 401, 403, 404, 409, 422 | ❌ |
| CircuitOpenError, BulkheadFullError | ❌ |

## Status codes for resilience

| Code | Use |
|---|---|
| 429 Too Many Requests | the *client* exceeded its quota (module 19) |
| 503 Service Unavailable + Retry-After | *we* are overloaded or a critical dependency is down |
| 504 Gateway Timeout | a proxy gave up waiting on an upstream |
| 200 + `degraded: true` | partial response, by design |

## Node snippets

```ts
// Cancel a fetch on timeout
await fetch(url, { signal: AbortSignal.timeout(250) });

// Combine a caller's signal with a timeout
const signal = AbortSignal.any([callerSignal, AbortSignal.timeout(250)]);

// Event loop delay as an overload signal
import { monitorEventLoopDelay } from "node:perf_hooks";
const h = monitorEventLoopDelay({ resolution: 20 }); h.enable();
// h.percentile(99) / 1e6 → p99 lag in ms

// Postgres statement timeout per connection
await client.query("SET statement_timeout = '500ms'");
```

## k6 minimum

```js
import http from "k6/http";
import { check } from "k6";
export const options = {
  scenarios: { s: { executor: "constant-arrival-rate", rate: 100, timeUnit: "1s", duration: "1m", preAllocatedVUs: 50 } },
  thresholds: { http_req_failed: ["rate<0.01"], http_req_duration: ["p(95)<500"] },
};
export default () => check(http.get("http://localhost:3000/health"), { ok: (r) => r.status === 200 });
```
