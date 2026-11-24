# Async JavaScript cheat sheet

## Scheduling: what runs when

| API | Queue | Runs |
|---|---|---|
| plain code | call stack | now, to completion |
| `process.nextTick(fn)` | nextTick queue | after the current operation, before promises (in CommonJS) |
| `promise.then(fn)`, code after `await`, `queueMicrotask(fn)` | microtask queue | after nextTicks, before any macrotask |
| `setTimeout(fn, ms)` / `setInterval` | timers phase | ≥ `ms` later, in a timers phase |
| I/O callbacks | poll phase | when the OS reports completion |
| `setImmediate(fn)` | check phase | right after the current/next poll phase |

**Yield to the event loop** (let I/O and timers run): `await new Promise((r) => setImmediate(r))`
or `import { setImmediate } from "node:timers/promises"; await setImmediate();`

## Promise combinators

```js
await Promise.all([a(), b()]);          // all succeed, or reject on first failure
await Promise.allSettled([a(), b()]);   // [{status:"fulfilled",value}|{status:"rejected",reason}]
await Promise.race([work(), timeout()]); // first to settle, success or failure
await Promise.any([primary(), replica()]); // first success; AggregateError if all fail
```

## Patterns

```js
// Parallel independent calls
const [user, orders] = await Promise.all([getUser(id), getOrders(id)]);

// Parallel over a list, results in input order
const users = await Promise.all(ids.map((id) => getUser(id)));

// Sequential over a list (each depends on the previous, or must not overlap)
for (const id of ids) await process(id);

// Bounded concurrency (pool of N workers)
const results = await mapWithConcurrency(ids, 5, getUser);

// Fire-and-forget, safely
void sendAnalytics(event).catch((err) => logger.error("analytics failed", err));

// Promise memoization / single-flight
const inflight = new Map();
function load(key) {
  if (!inflight.has(key)) {
    const p = fetchThing(key);
    inflight.set(key, p);
    p.catch(() => inflight.delete(key));
  }
  return inflight.get(key);
}

// Sleep
import { setTimeout as sleep } from "node:timers/promises";
await sleep(100);

// Wait for one event as a promise
import { once } from "node:events";
const [value] = await once(emitter, "ready");
```

## Timeouts and cancellation

```js
const ac = new AbortController();
const timer = setTimeout(() => ac.abort(new Error("timeout")), 2000);
try {
  const res = await fetch(url, { signal: ac.signal });
} finally {
  clearTimeout(timer);                  // always clear
}

await fetch(url, { signal: AbortSignal.timeout(2000) });          // shorthand
const signal = AbortSignal.any([requestSignal, AbortSignal.timeout(2000)]); // combine

// Make your own code abortable
async function poll(signal) {
  while (!signal.aborted) { await step(); }
  signal.throwIfAborted();
}
```

## Errors

```js
try { await risky(); } catch (err) { /* handles rejection */ }
risky().catch(handle);                   // same, without await
await Promise.reject(new Error("x"));    // reject with Error objects, not strings

process.on("unhandledRejection", (reason) => { logger.fatal(reason); process.exit(1); });
```

## Smells to catch in code review

| Smell | Problem |
|---|---|
| `arr.forEach(async ...)` | nothing awaited, errors unhandled |
| `await a(); await b();` with no dependency | needless latency |
| `Promise.all(hugeList.map(...))` | unbounded concurrency |
| promise call with no `await` / `return` / `.catch` | unhandled rejection |
| `if (!cache.has(k)) { v = await ...; cache.set(k, v) }` | duplicate work under concurrency |
| `await Promise.resolve()` as a yield | doesn't let I/O run |
| `new Promise(async (resolve) => ...)` | errors inside are lost; just use an async function |
| network call with no timeout | hangs forever when a dependency does |
| `emit(...)` in a constructor | listeners not attached yet |
