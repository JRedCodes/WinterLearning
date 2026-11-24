# Capacity planning and load testing

## Back-of-the-envelope capacity

A worked example. The product page gets 2M views/day, and peak traffic is about 3x the average.

```
average:  2,000,000 / 86,400 s ≈ 23 req/s
peak:     23 × 3 ≈ 70 req/s
safety:   plan for 2x peak = 140 req/s (launch days, bots, retries)
```

Each request takes ~120 ms at p50 (the slowest of three parallel downstream calls) and mostly waits on I/O. By Little's law, at 140 req/s: `140 × 0.12 ≈ 17` requests in flight. One Node process handles that easily. You'd still run at least 2–3 instances for availability, not for capacity.

Now the downstream view: the aggregator sends 140 req/s to **each** dependency, plus retries. With up to 3 attempts in the worst case, that's up to 420 req/s at pricing during an incident, unless a retry budget caps it at ~10% (≈154 req/s). That's the conversation to have with the pricing team *before* the incident.

## Utilization and queueing

For a single server with random arrivals (an M/M/1 queue), average time in system is `service_time / (1 − utilization)`:

| Utilization | Time in system (service = 10 ms) |
|---|---|
| 50% | 20 ms |
| 70% | 33 ms |
| 80% | 50 ms |
| 90% | 100 ms |
| 95% | 200 ms |
| 99% | 1,000 ms |

Real systems aren't exactly M/M/1, but the shape holds: latency explodes as you approach 100%. Plan peak load at 60–70% of measured capacity.

## Universal Scalability Law (the short version)

Adding instances doesn't scale perfectly. **Contention** (waiting on a shared resource: a DB lock, a single Redis key) makes throughput flatten. **Coherency** costs (instances coordinating with each other) can make throughput *decrease* as you add nodes. If a load test shows throughput going down when you add instances, look for shared state.

## Load testing with k6

```bash
k6 run k6/load.js                                  # the provided script
k6 run --vus 50 --duration 30s k6/load.js          # quick closed-model override
BASE_URL=http://localhost:8080 k6 run k6/load.js   # through nginx
```

### Open vs closed models

- **Closed model** (`vus` + `duration`): N virtual users each loop "request, wait for response, repeat". If the server slows down, the request rate drops automatically, which **hides overload**. This is called coordinated omission.
- **Open model** (`constant-arrival-rate`, `ramping-arrival-rate`): new requests arrive at a fixed rate regardless of response time, like real users. If the server can't keep up, you see it. Prefer this for capacity tests.

### Test types

| Type | Shape | Finds |
|---|---|---|
| Smoke | 1–5 VUs, 1 min | is the script/environment working? |
| Load | ramp to expected peak, hold | do we meet the SLO at peak? |
| Stress | ramp past peak until it breaks | the breaking point, and *how* it fails (gracefully?) |
| Spike | sudden jump, then drop | autoscaling lag, cold caches, connection storms |
| Soak | normal load for hours | memory leaks, connection leaks, log disk filling up |

### Reading results

- Look at **p95/p99**, not the average. Look at the **error rate** next to latency: a fast 503 can make latency look great.
- Watch **server-side metrics** at the same time (CPU, event loop lag, memory, pool usage, breaker states). The client only tells you *that* it's slow.
- **Find the knee**: the arrival rate where latency starts climbing steeply. Your capacity is somewhat below it.
- Make sure the load generator isn't the bottleneck (k6 prints its own warnings; watch its CPU).
- Test the **failure modes too**: run the load test while injecting faults (`REVIEWS_FAILURE_RATE=1 npm run dev`) and check the SLO still holds with degraded responses.

## Experiments to run with this module's challenge

1. Start the **starter** (naive) service with `PRICING_LATENCY_MS=2000` and run k6. Watch p99 and in-flight requests grow without bound.
2. Do the same with your solution. Pricing gets shed and served stale; p95 stays under 500 ms.
3. `REVIEWS_FAILURE_RATE=1`: watch `/health/dependencies` show the reviews breaker open, and the reviews call count drop to one trial every 15 s.
4. Lower `bulkhead.maxConcurrent` for pricing in `src/policies.ts` and find the point where shedding starts at your arrival rate. Check it against Little's law.
