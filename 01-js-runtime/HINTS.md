# Hints · The JavaScript Runtime

Open one hint at a time. Give each a real try before opening the next. Hints are grouped by symptom number from [CHALLENGE.md](CHALLENGE.md).

## Symptoms 1 & 3: empty batch, concurrency

<details><summary>Hint 1</summary>

The function returns before any report has been built. Which line starts the work, and does anything wait for it?
</details>

<details><summary>Hint 2</summary>

`Array.prototype.forEach` calls your callback and ignores what it returns. An `async` callback returns a promise, so those promises are dropped on the floor (and so are their rejections). Look around `src/lib/` for something that already handles "async map with a limit".
</details>

<details><summary>Hint 3</summary>

`return mapWithConcurrency(customerIds, concurrency, (id) => buildCustomerReport(id));` It awaits every call, preserves input order, caps concurrency and rejects on the first failure.
</details>

## Symptom 2: sequential upstream calls

<details><summary>Hint 1</summary>

Look at the first two `await`s in `buildCustomerReport`. Does the second call use anything from the first?
</details>

<details><summary>Hint 2</summary>

`await` pauses the function. To overlap two operations, start both before awaiting either.
</details>

<details><summary>Hint 3</summary>

`const [customer, orders] = await Promise.all([withTimeout(...customer...), withTimeout(...orders...)]);`
</details>

## Symptom 4: audit crash

<details><summary>Hint 1</summary>

The audit call is deliberately not awaited, which is correct for "must not delay the report". But what happens to a promise that rejects when nobody is listening?
</details>

<details><summary>Hint 2</summary>

Since Node 15, an unhandled rejection crashes the process. A fire-and-forget promise still needs a rejection handler. There's a `logger` option that's currently never used.
</details>

<details><summary>Hint 3</summary>

`void audit.record(event).catch((err) => logger.error("audit write failed ...", err));`
</details>

## Symptom 5: duplicate rate lookups, failures

<details><summary>Hint 1</summary>

Picture two calls to `get("USD", "EUR")` starting at the same moment. Step through both, remembering that other code runs during every `await`. What does each one find in the cache?
</details>

<details><summary>Hint 2</summary>

The cache only gets filled when the API *answers*. Until then, every caller sees an empty cache. What could you put in the cache immediately, before awaiting anything, that a second caller could reuse?
</details>

<details><summary>Hint 3</summary>

Store the promise: `const p = source.fetchRate(...); map.set(key, p); return p;` (no `await` in between). Then attach `p.catch(() => map.delete(key))` so a failed lookup is retried next time. Change the map's value type to `Promise<number>`.
</details>

## Symptom 6: timeouts that don't time out

<details><summary>Hint 1</summary>

Read `withTimeout` carefully. When the timer fires, what *exactly* happens? Who is responsible for actually rejecting?
</details>

<details><summary>Hint 2</summary>

Aborting a signal only *asks* the operation to stop. If the operation ignores the signal, `await fn(signal)` waits forever. `withTimeout` has to stop waiting on its own: race the operation against the deadline.
</details>

<details><summary>Hint 3</summary>

Return `new Promise((resolve, reject) => { ... })`. In the timer: create the `TimeoutError`, `controller.abort(err)`, `reject(err)`. Then `fn(signal).then(v => { clearTimeout(t); resolve(v) }, e => { clearTimeout(t); reject(signal.aborted ? signal.reason : e) })`. A promise ignores every resolve/reject after the first, so whichever happens first wins.
</details>

## Symptom 7: the yield that doesn't yield

<details><summary>Hint 1</summary>

The code awaits something between chunks. What kind of task does the continuation after that `await` become: a microtask or a macrotask?
</details>

<details><summary>Hint 2</summary>

The event loop drains the entire microtask queue before it runs any timer, I/O callback or immediate. A loop of `await Promise.resolve()` never lets the loop move on. See [docs/event-loop-puzzles.md](docs/event-loop-puzzles.md), puzzle 7.
</details>

<details><summary>Hint 3</summary>

`await new Promise<void>((resolve) => setImmediate(resolve));` That resumes in the check phase, after pending I/O has been handled.
</details>

## Symptom 8: missing `start` (and everything for empty jobs)

<details><summary>Hint 1</summary>

When does `run()` emit `"start"` relative to when the caller's `job.on("start", ...)` line executes?
</details>

<details><summary>Hint 2</summary>

An `async` function runs synchronously until its first `await`, and `emit` calls listeners synchronously. So `"start"` fires inside the constructor, before the caller has a job to attach listeners to. With zero customers there's no `await` at all, so `"done"` fires synchronously too.
</details>

<details><summary>Hint 3</summary>

Defer the start of `run()` until after the current synchronous code: `process.nextTick(() => void this.run())` (what Node core does), or `queueMicrotask`/`setImmediate`.
</details>
