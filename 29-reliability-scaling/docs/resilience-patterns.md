# Resilience patterns, one level deeper

## Composition order, and what changes if you swap things

The challenge uses `fallback → retry → breaker → bulkhead → timeout → call`. Here's what happens with other orders, so you can reason about library configurations you'll meet at work.

| Change | Effect |
|---|---|
| Timeout **outside** retry (one overall timeout) | Bounds total time, but a single hung attempt eats the whole budget and no retry happens. Many systems use **both**: a per-attempt timeout inside and an overall deadline outside. |
| Breaker **outside** retry | The breaker sees one result per *logical* call (after all retries). It opens more slowly, and retries keep hammering the downstream while the breaker is still closed. |
| Bulkhead **outside** the breaker | Calls that would be rejected by an open breaker still take (and briefly hold) a bulkhead slot. Mostly harmless, slightly wasteful. |
| Bulkhead **outside** retry | One slot is held across all attempts *and the backoff sleeps*. Under failure, slots are tied up sleeping, so fewer real calls get through. |
| Retry `CircuitOpenError` | The breaker opens and the retry loop keeps trying, so the backoff delays add latency for nothing. Always mark it non-retryable. |

There's no single right order, but there should be a deliberate one, written down (that's what `DECISIONS.md` is for).

## Breaker variants

- **Consecutive failures** (the challenge): simple, predictable, but one success in a stream of failures resets the count. Good when traffic is steady.
- **Failure rate over a sliding window**: e.g. "open if ≥ 50% of the last 100 calls (or last 10 seconds) failed, with at least 20 calls". More robust under mixed traffic. resilience4j and Polly default to this.
- **Slow-call rate**: count calls slower than X as failures even if they succeed. Catches the "slow, not dead" case before timeouts fire.
- **Per-host vs per-service**: a breaker per downstream *instance* (Envoy's outlier detection ejects individual bad hosts) lets you keep using the healthy ones.
- **Shared across processes?** Usually not. Each instance learns independently, which is fine and avoids a new shared dependency.

## Timeouts in Node specifically

- `fetch` (undici) has **no overall request timeout by default**. Pass `signal`.
- undici's `headersTimeout` / `bodyTimeout` exist (defaults are minutes), and they're per phase, not total.
- `pg`: set `statement_timeout` (server side) and `connectionTimeoutMillis` (pool checkout). A query waiting for a pool slot is waiting too!
- `ioredis`: `commandTimeout`, and think about `maxRetriesPerRequest` / the offline queue (module 19 discussed failing fast).
- Server side: `server.requestTimeout` and `server.headersTimeout` protect you from slow clients (slowloris).

## Hedged requests

For read-only calls with a long tail: send the request, and if it hasn't answered by the p95 latency, send a second copy to another instance and take whichever answers first. It cuts tail latency dramatically at the cost of a few percent more load. Only for idempotent reads, and combine with a budget so hedging can't double your load during an incident.

## Load shedding signals

How do you know you're overloaded, in Node?

- **In-flight requests** over a limit (Little's law tells you what's normal).
- **Event loop lag/utilization** (`perf_hooks.monitorEventLoopDelay`, `performance.eventLoopUtilization()`): if the loop is 95% busy, new work just queues.
- **Queue age**: if the oldest queued request has waited longer than the client will wait, serving it is pointless. Drop it (LIFO under overload is a known trick: the newest requests are the ones whose clients are still waiting).
- **Adaptive concurrency limits** (Netflix's `concurrency-limits`, Envoy's adaptive concurrency): measure latency and shrink the allowed concurrency when it rises, like TCP congestion control.

## Idempotency: the prerequisite for retries

A retry is only safe if doing the operation twice has the same effect as once. Reads are naturally idempotent; `PUT` and `DELETE` are by definition. For `POST`, send an `Idempotency-Key` header and have the server store the result per key (module 15 built this, module 23 designed it). Without idempotency, the only safe retry of a timed-out payment is "ask the payment service what happened".

## Fallback catalogue

| Fallback | Example | Watch out |
|---|---|---|
| Stale cache | last known price | bound the age; mark it stale |
| Default value | generic recommendations | must make sense to users |
| Omit the section | hide reviews | the client must handle `null` |
| Degraded mode | read-only mode when writes fail | communicate it in the UI |
| Queue for later | accept the order, process when the dependency is back | needs durable storage (module 20, 33) |
| Fail fast with a clear error | 503 + Retry-After | the right choice for critical data |

## Retry-After and client behavior

A `503` or `429` with `Retry-After: 5` is an instruction to well-behaved clients. Your own clients (frontends, SDKs, other services) should honor it, cap their retries, and add jitter. A server can be perfectly resilient and still be knocked over by its own mobile app retrying in a tight loop.
