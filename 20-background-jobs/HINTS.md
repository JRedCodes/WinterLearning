# Hints · Background Jobs

Open one hint at a time. Give each a real try before opening the next.

## TODO 1: Backoff

<details><summary>Hint 1</summary>

Two steps: compute the ceiling (exponential, capped), then pick a random point below it. `2 ** (n - 1)` is exponentiation in JS.
</details>

<details><summary>Hint 2</summary>

`Math.max(1, attemptsMade)` handles the "< 1" case. `Math.min(maxMs, ...)` handles both the cap and the `Infinity` you get from huge exponents.
</details>

<details><summary>Hint 3</summary>

`return Math.floor(random() * Math.min(settings.maxMs, settings.baseMs * 2 ** (attempt - 1)));`
</details>

## TODO 2: Default job options

<details><summary>Hint 1</summary>

Look at BullMQ's `DefaultJobOptions` type (Ctrl+click it in your editor): `attempts`, `backoff`, `removeOnComplete`, `removeOnFail`.
</details>

<details><summary>Hint 2</summary>

`removeOnComplete` accepts `boolean | number | { count?, age? }`. The tests want the object form for both.
</details>

## TODO 3: Deterministic job ids

<details><summary>Hint 1</summary>

`queue.add(name, data, opts)`: the third argument takes a `jobId`.
</details>

<details><summary>Hint 2</summary>

`{ jobId: \`${JOB.welcomeEmail}-${user.id}\` }`. When the id already exists, `add()` returns the existing job, so both calls report the same id.
</details>

## TODO 4: Idempotency store

<details><summary>Hint 1</summary>

ioredis: `await redis.set(key, value, "PX", ms, "NX")` returns `"OK"` if it set the key and `null` if the key already existed.
</details>

<details><summary>Hint 2</summary>

After a failed `SET NX`, `GET` the key to tell "done" from "busy". If `GET` returns `null`, the lease expired in between: try the claim once more.
</details>

<details><summary>Hint 3</summary>

Release needs compare-and-delete in one step:

```lua
if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) end
return 0
```
Run it with `redis.eval(script, 1, fullKey, "in-progress")`. `complete()` is a plain `SET key "done" PX ttl` (no NX: it overwrites the claim).
</details>

## TODO 5: Idempotent email processor

<details><summary>Hint 1</summary>

The claim key must describe the *fact* ("welcome email for user X"), so two different jobs for the same user collide on it.
</details>

<details><summary>Hint 2</summary>

Three outcomes of `claim()` → three branches. Only "acquired" sends. "busy" must throw a *normal* error (so BullMQ retries later), not `UnrecoverableError`.
</details>

<details><summary>Hint 3</summary>

```
user = find; if none → throw new UnrecoverableError(...)
claim = await idempotency.claim(key, leaseMs)
done → return skipped; busy → throw new Error(...)
try { await email.send({..., idempotencyKey: key}) } catch (e) { await release(key); throw e }
await complete(key, doneTtlMs); return sent
```
</details>

## TODO 6: Error classification

<details><summary>Hint 1</summary>

`new URL("not a url")` throws. `new URL("ftp://x").protocol` is `"ftp:"`.
</details>

<details><summary>Hint 2</summary>

Validate first, before any I/O, so bad input never reaches the thumbnailer. Wrap `new URL` in `try/catch` inside a small `isHttpUrl(value): boolean` helper.
</details>

## TODO 7: Dead-letter queue

<details><summary>Hint 1</summary>

`withDeadLetter` returns a *new* async function that calls the original inside `try/catch`.
</details>

<details><summary>Hint 2</summary>

In the catch: `if (isFinalAttempt(job, err))` build the `DeadLetterData` from `job.queueName`, `job.id`, `job.name`, `job.data`, and `attemptsMade: job.attemptsMade + 1`. Then `throw err`, always.
</details>

<details><summary>Hint 3</summary>

Put the `sink.add(...)` in its own `try/catch` that calls `onSinkError`, so a DLQ failure can't replace the original error. Use `{ jobId: \`${job.queueName}-${job.id}\` }`.
</details>

## TODO 8: Graceful shutdown

<details><summary>Hint 1</summary>

What does the `true` argument to `worker.close(true)` mean? Check the BullMQ docs or the type definition.
</details>

<details><summary>Hint 2</summary>

`worker.close()` with no argument waits for active jobs to finish. That's the whole fix. The interesting part is understanding *why* force-closing caused duplicate emails.
</details>
