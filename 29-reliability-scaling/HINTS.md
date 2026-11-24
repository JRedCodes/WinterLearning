# Hints · Reliability & Scaling

Open one hint at a time. Give each a real try before opening the next.

## TODO 1: `withTimeout`

<details><summary>Hint 1</summary>

You need three things: an `AbortController`, a timer, and `Promise.race` between fn's promise and a promise that rejects when the timer fires.
</details>

<details><summary>Hint 2</summary>

When the timer fires: create the `TimeoutError`, call `controller.abort(error)` (the reason shows up as `signal.reason`), and reject the deadline promise with the same error. Clear the timer in a `finally`.
</details>

<details><summary>Hint 3</summary>

To call fn immediately but still turn a synchronous `throw` into a rejection: `const work = (async () => fn(controller.signal))();`. Then `return await Promise.race([work, deadline])` inside `try { } finally { clearTimeout(timer) }`.
</details>

## TODO 2: `backoffDelay` and `retry`

<details><summary>Hint 1</summary>

`backoffDelay` is two lines: compute the capped exponential, then apply jitter (or not). The default for `jitter` is `"full"`, and the default for `random` is `Math.random`.
</details>

<details><summary>Hint 2</summary>

`retry` is a `for (let attempt = 1; ; attempt++)` loop with a `try/catch`. In the `catch`, decide "rethrow now?" before sleeping: last attempt, not retryable, or no budget token.
</details>

<details><summary>Hint 3</summary>

```ts
try {
  const result = await fn(attempt);
  options.budget?.recordSuccess();
  return result;
} catch (error) {
  if (attempt >= options.attempts || !retryOn(error)) throw error;
  if (options.budget && !options.budget.tryAcquire()) throw error;
  const delayMs = backoffDelay(attempt, options);
  options.onRetry?.({ attempt, delayMs, error });
  await sleep(delayMs);
}
```
</details>

## TODO 3: `RetryBudget`

<details><summary>Hint 1</summary>

One number: `tokens`, starting at `maxTokens`. That's the whole state.
</details>

<details><summary>Hint 2</summary>

`recordSuccess`: `Math.min(maxTokens, tokens + tokenRatio)`. `tryAcquire`: `if (tokens < 1) return false; tokens -= 1; return true;`.
</details>

## TODO 4: `CircuitBreaker`

<details><summary>Hint 1</summary>

State to keep: the current state, the consecutive failure count, when the circuit opened, and whether a half-open trial is in flight.
</details>

<details><summary>Hint 2</summary>

Make the `state` getter do the time-based transition: if the state is `open` and `now() - openedAt >= resetTimeoutMs`, transition to `half_open`. Then `execute` starts with `const state = this.state` and branches: open → throw `CircuitOpenError(resetTimeoutMs - elapsed)`; half_open with a trial already running → throw `CircuitOpenError(0)`; otherwise run fn.
</details>

<details><summary>Hint 3</summary>

After fn: success (or an error where `isFailure` is false) → reset the count, transition to `closed` if not already. Failure → if half-open, re-open immediately (set `openedAt = now()`); if closed, increment and open at the threshold. Clear the "trial in flight" flag in a `finally`. Route every state change through one `transition(to)` helper that calls `onStateChange`.
</details>

## TODO 5: `Bulkhead`

<details><summary>Hint 1</summary>

State: a `running` counter and a FIFO array of waiters. A waiter is just the `resolve` function of a promise the caller is awaiting.
</details>

<details><summary>Hint 2</summary>

`run`: if `running < maxConcurrent`, increment and go. Else if `waiting.length < maxQueue`, `await new Promise<void>((resolve) => waiting.push(resolve))`. Else throw `BulkheadFullError`. Run fn in `try { } finally { release() }`.
</details>

<details><summary>Hint 3</summary>

The neat trick in `release()`: if someone is waiting, **hand your slot to them** (`waiting.shift()!()`) without decrementing `running`; only decrement when nobody is waiting. That way a newly arriving caller can never sneak in ahead of the queue.
</details>

## TODO 6: the service

<details><summary>Hint 1</summary>

Start with the structure, then add the stack: `Promise.allSettled` over the three calls, then turn each settled result into data or a fallback. Get the healthy, hang and 404 tests passing before the breaker and bulkhead ones.
</details>

<details><summary>Hint 2</summary>

Create one `{ breaker, bulkhead, budget }` per downstream in the constructor (not per request, or they'd never remember anything). Then one private helper does the wrapping:

```ts
private call<T>(name: ServiceName, fn: (signal: AbortSignal) => Promise<T>) {
  const p = this.deps.policies[name];
  const g = this.guards[name];
  return retry(() => g.breaker.execute(() => g.bulkhead.run(() => withTimeout(fn, p.timeoutMs))),
               { ...p.retry, random: this.random, budget: g.budget, retryOn: isRetryable });
}
```
</details>

<details><summary>Hint 3</summary>

- `isRetryable(e)`: `TimeoutError`, or `DownstreamError` with status 0, 429 or ≥ 500. Everything else (NotFound, CircuitOpen, BulkheadFull) → false.
- Breaker `isFailure`: not `NotFoundError` and not `BulkheadFullError`.
- Pass `now` from deps to every breaker and to a `LastKnownGood<Price>` cache; `set` it on every successful price, `get` it when pricing fails.
- Catalog rejected: rethrow `NotFoundError`; otherwise `throw new UpstreamUnavailableError("catalog", seconds)` where seconds comes from `CircuitOpenError.retryAfterMs` if that's the cause, else 1.
- Push `"pricing"` / `"reviews"` into `unavailable` in that order; `degraded = unavailable.length > 0`.
</details>
