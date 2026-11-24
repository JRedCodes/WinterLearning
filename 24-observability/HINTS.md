# Hints · Observability

Open one hint at a time. Give each a real try before opening the next.

## Finding 1: secrets in logs

<details><summary>Hint 1</summary>

Run a checkout with `LOG_LEVEL=trace` and read the raw lines. Which two debug lines contain the secrets, and under which keys?
</details>

<details><summary>Hint 2</summary>

pino can mask values for you before a line is written. Look at the `redact` option in `src/lib/logger.ts`'s `pino({...})` call. Paths are relative to the object you log.
</details>

<details><summary>Hint 3</summary>

`"request received"` logs `{ headers: req.headers }` and `"authorizing payment"` logs `{ payment: {...} }`. So you need paths like `headers.authorization`, `headers.cookie`, `payment.cardNumber`, `payment.cvc`, with `censor: "[Redacted]"`.
</details>

## Finding 2: correlation

<details><summary>Hint 1</summary>

The service calls `currentLogger(fallback)`. When does that return the request logger, and when the fallback? Who is supposed to put the request logger there?
</details>

<details><summary>Hint 2</summary>

`AsyncLocalStorage` only works for code that runs *inside* `storage.run(ctx, fn)`. Look at `src/middleware/requestContext.ts`: it builds a logger and stores it on `res.locals`, but does it ever call `runWithContext`?
</details>

<details><summary>Hint 3</summary>

Replace the final `next()` with `runWithContext({ requestId, trace, logger }, next)`. Everything after this middleware, including the service's awaits, now sees the context.
</details>

## Finding 3: cardinality

<details><summary>Hint 1</summary>

Look at the labels passed to `observe(...)` in `src/middleware/httpMetrics.ts`. Which one is unbounded?
</details>

<details><summary>Hint 2</summary>

Express sets `req.route` when a route matches, and `req.route.path` is the template (`/orders/:id`). Routers add `req.baseUrl`. Neither is set yet when the middleware starts, but both are set by the time `finish` fires.
</details>

<details><summary>Hint 3</summary>

A small helper: `typeof req.route?.path === "string" ? req.baseUrl + req.route.path : "unmatched"`. Use it inside the `finish` callback.
</details>

## Finding 4: latency units

<details><summary>Hint 1</summary>

Look at the metric's name and its buckets in `src/lib/metrics.ts`. Then look at the number passed to `observe`.
</details>

<details><summary>Hint 2</summary>

`Date.now() - start` is milliseconds. The histogram expects seconds.
</details>

<details><summary>Hint 3</summary>

Divide by 1000, or better, measure with `process.hrtime.bigint()` (or `performance.now()`) for sub-millisecond precision and convert to seconds. `histogram.startTimer()` also does this for you.
</details>

## Finding 5: probes

<details><summary>Hint 1</summary>

Read the two handlers in `src/routes/healthRoutes.ts` and the table in the lesson (section 6). What does each probe *trigger* when it fails?
</details>

<details><summary>Hint 2</summary>

The dependency checks are in the wrong handler. Separately, `runChecks` awaits each check with no upper bound, so a check whose promise never settles makes the whole probe hang.
</details>

<details><summary>Hint 3</summary>

`/healthz` → just `200 {status:"ok"}`. `/readyz` → `runChecks(checks, timeoutMs)` where each check is wrapped: `Promise.race([check(), timeoutPromise])`, the timeout rejecting with `new Error(\`timed out after ${ms}ms\`)`. Clear the timer in `finally` so it doesn't keep the process alive.
</details>

## Finding 6: traces

<details><summary>Hint 1</summary>

Two halves: *incoming* (does the middleware use the header it received?) and *outgoing* (does the payments call send one?). `src/lib/tracing.ts` already has all the helpers you need.
</details>

<details><summary>Hint 2</summary>

The middleware calls `startTrace()` unconditionally. And `createTracedFetch` sets `x-request-id` but never `traceparent`. Also: the outgoing side reads `currentContext()`, so it only works once finding 2 is fixed.
</details>

<details><summary>Hint 3</summary>

Incoming: `continueTrace(req.get("traceparent"))`. Outgoing: `headers.set("traceparent", formatTraceparent(childSpan(ctx.trace)))`.
</details>

## Part B: the incident

<details><summary>Hint 1</summary>

Start with the shape: when do `request aborted by client` lines start and stop? Then ask "what changed just before?" Look at the `service starting` lines and what each pod logged right after starting.
</details>

<details><summary>Hint 2</summary>

Compare the two metrics snapshots line by line. One `dependency` label exists only in the second. Look at its latency buckets, in-flight and queued gauges. Then check the config that pod logged for that dependency at startup. What's `timeoutMs`?
</details>

<details><summary>Hint 3</summary>

The story: a new release added a synchronous call to a dependency with no timeout → the dependency slowed down → sockets held → pool of 50 exhausted → requests queue → the proxy gives up at 30 s. Why didn't 5xx alerts or readiness notice? (Check the note at the top of `metrics-1420.txt`.) Was the payments blip involved? Check whether checkout even reached payments during the outage. Write the root cause with the exact component name and version string from the logs.
</details>
