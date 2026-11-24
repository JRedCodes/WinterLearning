# Resume bullets: a working guide

> How to turn what you built in this course into bullets a reviewer believes. Includes a verb list, a module-by-module idea bank and a self-review checklist.

## The shape

> **Verb** + **what** + **how** + **result (with a number you can defend)**

You won't always have all four. "What" and "how" are mandatory; a result with a number is what separates good from great.

## Rewriting, step by step

Start: *"Worked on rate limiting for an API."*

1. **Strong verb, specific what:** "Implemented three rate-limiting algorithms for an Express API."
2. **How:** "...using Redis and atomic Lua scripts behind a common interface."
3. **Result:** "...verified exactly N of 50 parallel requests are admitted across two app instances."

Final: *"Implemented fixed-window, sliding-window and token-bucket rate limiters in Redis with atomic Lua scripts; tests verify exact limits under 50 parallel requests across 2 app instances."*

## Verb bank

| Building | Improving | Fixing | Leading/communicating |
|---|---|---|---|
| Built, Designed, Implemented, Developed, Created, Shipped, Deployed | Optimized, Reduced, Cut, Accelerated, Hardened, Refactored, Simplified | Diagnosed, Debugged, Resolved, Eliminated, Prevented | Documented, Wrote, Presented, Reviewed, Authored |

Avoid: *responsible for, worked on, helped with, was involved in, participated in, utilized*.

## Idea bank by module

Use these as prompts, then fill in **your** real details and numbers.

| Module | Possible angle |
|---|---|
| 06 | Refactored a ~500-line god file into layered architecture with DI; added unit tests per layer |
| 09 | Wrote a test suite that kills all mutants in a mutation-testing harness; found N real bugs |
| 14 | Cut queries per request from X to Y (N+1 fix); replaced seq scans with index scans; keyset pagination |
| 15 | Fixed overbooking, lost updates, double charges and deadlocks under 20–50 concurrent requests |
| 18 | Cache-aside with coalescing: N concurrent misses → 1 DB call; negative caching; hit/miss metrics |
| 19 | Distributed rate limiters with atomic Lua; correct across instances; fail-open option |
| 20 | Idempotent background workers with retries, backoff and a dead-letter queue |
| 22 | Session auth with Redis, RBAC and ownership checks; fixed 4 planted auth vulnerabilities |
| 23 | Spec-first OpenAPI 3.1 design with idempotency keys, cursor pagination, ETag concurrency |
| 24 | Structured logging with request-scoped context, Prometheus histograms, and an incident postmortem |
| 25 | Remediated 7 OWASP-class vulnerabilities (SQLi, SSRF, path traversal, prototype pollution...) |
| 26 | Multi-stage non-root Docker image, CI with a Postgres service, graceful shutdown with drain |
| 28 | WebSocket chat scaled across instances with Redis pub/sub and heartbeats |
| 29 | Timeouts, retries with jitter, circuit breaker and bulkhead; graceful degradation |
| 30 | Wrote five system design documents (feed, notifications, chat, rate limiter, ticketing) |
| 31 | End-to-end URL shortener with Redis-fronted redirects and async click analytics |
| 33 | Transactional outbox + inbox dedupe; DLQ; event versioning with an upcaster |
| 34–35 | Kubernetes manifests and a Helm chart with probes, HPA and PDB; debugged 6 broken manifests |
| 36 | The capstone: lead with concurrency-safe booking, events, realtime and deployment |

## Getting real numbers

- **Tests:** count them (`vitest run` prints totals). Name the invariants they prove.
- **Concurrency:** the concurrency levels your tests use are real numbers.
- **Query counts:** module 14's instrumented pool counts queries per request.
- **Latency/throughput:** run the k6 script from module 29 on your machine. Report p95 and requests/s with the context ("on a laptop, single instance").
- **Size:** rows seeded, endpoints, services, migrations, manifests.

## Self-review checklist

- [ ] Every bullet starts with a strong verb
- [ ] Every number is true and I can explain how I got it
- [ ] Each bullet fits in one or two lines on the page
- [ ] No bullet is just a technology list
- [ ] Projects are labelled as personal/learning projects
- [ ] The capstone has the most and best bullets
- [ ] Keywords from job ads I care about appear naturally (TypeScript, Postgres, Redis, Kafka, Docker, Kubernetes, CI/CD)
- [ ] One page total
