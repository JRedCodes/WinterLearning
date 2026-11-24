# Challenge · Checkout: observability review + incident postmortem

**Type:** 🐛 Debug (incident) · **Est:** 4–5h · **Services:** none

## Scenario

> **#checkout-team** · *Dana (staff engineer):* Two things before the reliability review on Friday.
>
> **1.** The platform team audited our instrumentation and filed six findings against the checkout service (below). The code *looks* instrumented (pino, prom-client, health endpoints, a tracing helper), but they say half of it doesn't work the way we think. Can you fix them? Their acceptance tests are in `test/`.
>
> **2.** Nobody has written up Tuesday's checkout outage yet. I've exported the logs and two metrics snapshots into `challenge/incident/`. Please figure out what actually happened and write the postmortem. Blameless, evidence-based, with real action items. Then put a short proposal in `DECISIONS.md` for the SLO and alerting we should have had.

## Part A: the audit findings

Each finding describes a **symptom**. Finding the code responsible is part of the job. There are **six findings** and they map to **six separate defects** (one finding can need changes in more than one file).

| # | Finding (as filed by the platform team) |
|---|---|
| 1 | **Secrets in logs.** Security found full card numbers, CVCs and `Authorization` bearer tokens in our log vendor, coming from the checkout service's debug lines. We still want those debug lines (they're useful) but with the sensitive values masked as `[Redacted]`. |
| 2 | **Logs can't be correlated.** The access log line (`request completed`) has a `requestId`, but business lines from the service layer (`payment authorized`, `payment declined`) don't. During incidents we can't connect "this request was slow" with "this is what it did". |
| 3 | **Cardinality alert.** Prometheus flagged `http_request_duration_seconds` as our fastest-growing metric: tens of thousands of series and climbing. Every order id and every bot probing `/wp-admin.php` seems to create a new one. |
| 4 | **The latency dashboard is useless.** p50, p95 and p99 for every route are always exactly "10s" (the top bucket), even for health checks that take a millisecond. |
| 5 | **Probes did the opposite of what we wanted.** During last month's payments-provider outage, Kubernetes restarted *every* checkout pod in a loop, while traffic kept going to pods that couldn't take payments. Also, when the payments health endpoint hangs (instead of erroring), our probe hangs with it. |
| 6 | **Traces stop at our door.** The API gateway sends a W3C `traceparent` header, but in the tracing UI every checkout request starts a brand-new trace, and calls from checkout to payments show up as unrelated root spans. |

## Part B: the incident

1. Read `challenge/incident/README.md` (what's known from Slack + how to query the logs).
2. Investigate `logs.ndjson`, `metrics-1350.txt` and `metrics-1420.txt`.
3. Fill in every section of `challenge/incident/POSTMORTEM.md`.
4. Fill in `challenge/DECISIONS.md`: what SLI/SLO and alerts checkout should have.

## Acceptance criteria

Part A (`test/logging.test.ts`, `test/metrics.test.ts`, `test/health.test.ts`, `test/tracing.test.ts`):

- [ ] Each request produces exactly one `request completed` log line with `requestId`, method, status and duration. *(passes already: don't break it)*
- [ ] Service-layer log lines carry the same `requestId` and `traceId` as the access log, even with many concurrent requests. (finding 2)
- [ ] 5xx errors are logged once at `error` level with the request id and the serialized error (type + stack), and never leaked to the client.
- [ ] No card number, CVC, bearer token or session cookie appears anywhere in the logs at `trace` level, and the debug lines still exist with `[Redacted]` in place of the values. (finding 1)
- [ ] `/metrics` exposes `http_request_duration_seconds{method,route,status_code}` and `checkouts_total{outcome}`.
- [ ] The `route` label is the route template (`/orders/:id`), never a raw path or query string. Unmatched requests use `route="unmatched"`. (finding 3)
- [ ] Durations are recorded in seconds. (finding 4)
- [ ] `/healthz` returns `200 {"status":"ok"}` without calling any dependency check. (finding 5)
- [ ] `/readyz` runs the checks in parallel with a per-check timeout: `200 {"status":"ok","checks":{…}}` or `503 {"status":"unavailable","checks":{…}}` with `{ ok: false, error }` for failing checks (a timeout's error says "timed out"). (finding 5)
- [ ] A valid incoming `traceparent` is continued (same trace id in logs). Malformed or missing ones start a new trace. (finding 6)
- [ ] Outgoing calls to payments carry a `traceparent` with the same trace id and a new span id, plus `x-request-id`. (finding 6)

Part B (`test/writeups.test.ts`):

- [ ] `POSTMORTEM.md`: every section filled in (no `TODO`), a timeline with ≥ 6 timestamped bullets (`- HH:MM …`), ≥ 3 action items.
- [ ] The root cause section names the faulty component and the release that introduced it, exactly as they appear in the logs, and explains the mechanism (what was missing). The test checks hashed answers, so reading the test won't help.
- [ ] `DECISIONS.md`: Context / Options considered / Decision / Consequences filled in, with a numeric SLO target (e.g. `99.5%`).
- [ ] `npm test` and `npm run typecheck` pass.

## Getting started

```bash
cd 24-observability/challenge
make install
make test          # 6 failing findings + the write-ups
```

To see it running for real (optional, recommended):

```bash
make fake-payments                     # terminal 1: fake payments on :4001, prints received trace headers
LOG_LEVEL=debug make dev               # terminal 2
curl -s localhost:3000/checkout -H 'content-type: application/json' \
  -H 'traceparent: 00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01' \
  -d '{"customerId":"cus_1","items":[{"sku":"MUG","quantity":1,"unitPriceCents":1200}],"payment":{"cardNumber":"4242424242424242","cvc":"123"}}'
curl -s localhost:3000/metrics | grep http_request_duration
curl -i localhost:3000/readyz
```

Tip: pipe the dev server through `npx pino-pretty` for readable logs.

## Rules

- Don't modify the tests or `test/helpers.ts`.
- Keep the layering: the service must not import Express or read `res.locals`. Context reaches it through `AsyncLocalStorage`.
- No new dependencies (no OpenTelemetry SDK here; you'll appreciate it more after doing it by hand).
- Fix findings 1 and 4 by fixing the instrumentation, not by deleting log lines or metrics.
- The postmortem must be supported by the data. Don't guess; quote times and numbers.

## Stretch goals

1. Record client-aborted requests (`close` without `finish`) as `status_code="499"` in the histogram and the access log. Re-read the incident: why does this matter?
2. Add `upstream_request_duration_seconds{dependency}` and an in-flight gauge to `PaymentsClient`, like the ones in the incident snapshot.
3. Replace the hand-rolled tracing with `@opentelemetry/sdk-node` + auto-instrumentations exporting to the console, and compare.
4. Write the PromQL for your DECISIONS.md alerts (see [docs/metrics-and-promql.md](docs/metrics-and-promql.md)).
5. Add a `version` field to the root logger (from an env var), like in the incident logs.

## Done?

1. `npm test` is green and `npm run typecheck` is clean.
2. Commit on your branch `module/24-observability`, push and open a PR. CI runs this module's tests.
3. From the repo root: `npm run progress -- 24`.
4. Answer the questions in [INTERVIEW.md](INTERVIEW.md).
5. Add an entry to [LOG.md](../LOG.md).
6. Compare with the reference solution: `git diff main origin/solutions -- 24-observability/` (and read `SOLUTION.md` on that branch).

Stuck? → [HINTS.md](HINTS.md)
