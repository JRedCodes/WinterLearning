# Challenge · The Flaky Report Generator

**Type:** 🐛 Debug · **Est:** 3h · **Services:** none

## Scenario

> **JIRA · REP-417 · Priority: High**
> **Title:** Customer report generator: slow, flaky, and it crashed prod twice
>
> The `report-lib` package (in `challenge/src/`) builds per-customer revenue reports for the finance dashboard. It was written in a hurry before the quarter close. Since we started using it for the big accounts, we've collected these reports from on-call and from the finance team:
>
> 1. **"Batch export returns nothing."** `buildCustomerReports([...ids])` resolves instantly with an empty array. Sometimes, a bit later, the logs show an unhandled rejection for a customer id nobody's waiting on anymore.
> 2. **"Single reports are slower than they should be."** Tracing shows the customer lookup and the orders lookup happening strictly one after the other, although neither needs the other's result. Report latency is the *sum* of both upstream calls.
> 3. **"Batch exports hammer the upstream API."** Once (1) is worked around, a 500-customer batch should respect the `concurrency` option (default 4). The platform team asked us to keep it that way.
> 4. **"Process crashed: `Error: audit service unavailable`."** The audit service had a short outage, and our whole API process went down with it. Audit is best-effort by design: it must never fail or delay a report, but failures must at least show up in our logs (via the `logger` option).
> 5. **"We pay for 10x more rate lookups than expected."** The FX-rates API is billed per call. During a batch, the same currency pair (e.g. USD→EUR) is fetched many times *at the same moment*, despite the `RateCache`. Also: after the rates API had a blip, finance claims a retry "just worked", so we must not cache failures.
> 6. **"Reports hang forever when the orders service is down."** We set `timeoutMs: 2000`, and the orders service sometimes hangs without ever responding (it ignores cancellation). Requests pile up until the pod is OOM-killed. A timeout should be a timeout, and it should surface as a `TimeoutError`.
> 7. **"Health checks fail while a big account's report is running."** Summarizing an account with ~1M orders takes ~400ms of CPU. The code *says* it yields between chunks, yet the event-loop-delay metric spikes and the load balancer marks the pod unhealthy.
> 8. **"Progress bar never shows 'Starting…'."** The dashboard listens to `startReportJob(...)` events right after creating the job. It gets `progress` and `done`, but never `start`. For jobs with zero customers it gets **nothing at all** and spins forever.
>
> There are **7 bugs** behind these 8 symptoms (one bug causes two of them). Please fix them without changing the public API.

## Your task

1. Run the tests and read the failures. Each test name describes expected behavior; the assertion messages point at the symptom.
2. Run `npm run demo` to see some of the symptoms live (including a crash).
3. For each symptom, find the root cause in `src/`, fix it, and make sure you can **explain why** it happened in terms of the event loop, promises or events. That explanation is the real deliverable; interviewers ask about exactly these bugs.
4. Keep a short note per bug (symptom → root cause → fix) in your PR description.

## Acceptance criteria

- [ ] `buildCustomerReports` returns every report, in input order, rejects if any customer fails, and never runs more than `concurrency` customers at once. *(symptoms 1, 3)*
- [ ] `buildCustomerReport` fetches the customer and orders concurrently. *(symptom 2)*
- [ ] A failing audit write is logged via `logger.error(message, err)`, causes no unhandled rejection, and a slow audit write doesn't delay the report. *(symptom 4)*
- [ ] Concurrent `RateCache.get` calls for the same pair share a single API call; failures are not cached. *(symptom 5)*
- [ ] `withTimeout` rejects with `TimeoutError` at the deadline even if the operation ignores the signal; aborts the signal; leaves no timer behind on success. *(symptom 6)*
- [ ] `summarizeOrders` lets the event loop run other callbacks between chunks. *(symptom 7)*
- [ ] `ReportJob` listeners attached right after `startReportJob()` receive `start`, every `progress`, and `done` (or `error`), including for an empty job. *(symptom 8)*
- [ ] No unhandled rejections in the test run. `npm test` and `npm run typecheck` pass.

## Getting started

```bash
cd 01-js-runtime/challenge
make install
make test          # 14 failing tests, and Vitest reports unhandled errors
npm run demo       # watch it misbehave
npm run test:watch # rerun on save while you work
```

Tip: work symptom by symptom. Run one file at a time with `npx vitest run test/rates.test.ts`.

## Rules

- Don't modify the tests or `test/fakes.ts`.
- Keep the public API (exports in `src/index.ts` and their signatures) unchanged.
- No new dependencies. Everything you need is in Node's standard library and in `src/lib/`.
- Don't "fix" symptom 4 by awaiting the audit write (it must not delay reports), or symptom 7 by removing chunking.
- Don't fix timing problems with longer sleeps or bigger timeouts.

## Stretch goals

1. Add an `AbortSignal` option to `buildCustomerReports` so a caller can cancel a whole batch (e.g. when the HTTP client disconnects). Make sure in-flight upstream calls get the signal too.
2. Make `ReportJob` also usable as a promise: `await job.result()` (hint: `events.once`).
3. Add `exportCsv(reports, writable)` that writes one line per report and respects backpressure (`write()` returning `false`). Test it with a slow `Writable`.
4. Measure: add a test or script that reports p99 event-loop delay while summarizing 1M orders, before and after your fix (`perf_hooks.monitorEventLoopDelay`).

## Done?

1. `npm test` is green and `npm run typecheck` is clean.
2. Commit on your branch `module/01-js-runtime` (one commit per bug is ideal: `fix(01): ...`), push and open a PR with your symptom → cause → fix notes. CI runs this module's tests. Ask Claude to review the PR if you want feedback.
3. From the repo root: `npm run progress -- 01` to tick it off on the roadmap.
4. Answer the questions in [INTERVIEW.md](INTERVIEW.md).
5. Add an entry to [LOG.md](../LOG.md).
6. Compare with the reference solution: `git diff main origin/solutions -- 01-js-runtime/` (and read `SOLUTION.md` on that branch).

Stuck? → [HINTS.md](HINTS.md)
