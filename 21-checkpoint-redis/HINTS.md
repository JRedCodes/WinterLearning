# Hints · Checkpoint: Redis

Open one hint at a time. These are grouped by the part of the system you're stuck on.

## Getting started / structure

<details><summary>Hint 1</summary>

Start by making `createSystem` return `{ app, close }` where `app` only has `/health` and `close` resolves. One green test is a great first commit. Then grow it outward.
</details>

<details><summary>Hint 2</summary>

Write the ports first (`PreviewRepository`, `PreviewCache`, `PreviewJobQueue` interfaces in `src/services/`), then a service that uses them. The service is just the decision tree from the lesson's flow diagram. Adapters come after.
</details>

<details><summary>Hint 3</summary>

`system.ts` builds things in dependency order: pg Pool → run migrations → Redis client → adapters (repo, cache, queue, limiter) → services → worker → `createApp(...)`. `close()` tears down in reverse: worker → queue → Redis → pool.
</details>

## Validation & normalization

<details><summary>Hint 1</summary>

`new URL(input)` throws for relative or garbage input. Check `typeof input === "string"` and the length first, then the protocol.
</details>

<details><summary>Hint 2</summary>

`const u = new URL(input); u.hash = ""; return u.toString();`. The parser already lowercases the host. Throw a domain error (e.g. `InvalidUrlError`) and map it to 400 in the error handler.
</details>

## Dedupe

<details><summary>Hint 1</summary>

"Look in Postgres, then enqueue" isn't enough under concurrency: all 20 requests see "not found". What part can be made atomic?
</details>

<details><summary>Hint 2</summary>

Give the BullMQ job a deterministic id derived from the normalized URL (hash it: URLs are long and contain `:`). `queue.add(name, data, { jobId })` returns the existing job if the id exists.
</details>

<details><summary>Hint 3</summary>

GET's "pending" check is then `await queue.getJob(jobIdFor(url))` plus `await job.getState()`: anything other than `completed`/`failed` is pending.
</details>

## Worker, retries and failures

<details><summary>Hint 1</summary>

Queue `defaultJobOptions`: `attempts: options.jobs.attempts`, `backoff: { type: "exponential", delay: options.jobs.backoffMs }`.
</details>

<details><summary>Hint 2</summary>

In the processor, catch the error. If it's a `PermanentFetchError`, rethrow as BullMQ's `UnrecoverableError`. To know whether you're on the last attempt: `job.attemptsMade + 1 >= job.opts.attempts`.
</details>

<details><summary>Hint 3</summary>

On the final attempt (or a permanent error), call a service method that stores a `failed` row *before* rethrowing. Use `INSERT ... ON CONFLICT (url) DO UPDATE` for both ready and failed, so a job that runs twice is harmless.
</details>

## Caching

<details><summary>Hint 1</summary>

Cache-aside: on read, check Redis, then Postgres; when Postgres has a ready preview, write it to Redis with `SET key json EX ttl`. The worker can also write to the cache after a successful fetch.
</details>

<details><summary>Hint 2</summary>

JSON turns `Date` into a string. Convert `fetchedAt` back when reading from the cache (or keep ISO strings in your domain type).
</details>

## Rate limiting

<details><summary>Hint 1</summary>

Order matters: authenticate first, then limit by the API key (hash it for the Redis key).
</details>

<details><summary>Hint 2</summary>

A fixed window is enough: key `wl:21:<ns>:rl:<keyHash>:<windowNumber>`, `INCR` + `PEXPIRE` in one small Lua script, compare with the limit. `Retry-After` = seconds until the window ends, at least 1.
</details>

## Graceful close

<details><summary>Hint 1</summary>

`worker.close()` (no `true`) waits for the active job. Close the pool *after* the worker, since the active job still needs it to save its result.
</details>

<details><summary>Hint 2</summary>

Make `close()` idempotent by storing the promise: `closing ??= (async () => { ... })(); return closing;`
</details>

## Architecture tests failing?

<details><summary>Hint 1</summary>

If a service imports `PermanentFetchError` from `../contract.js` that's fine: the contract isn't infrastructure. But `UnrecoverableError` comes from `bullmq`, so that mapping belongs in the worker adapter, not the service.
</details>
