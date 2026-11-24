# Testing time, timers and files

Time and the filesystem are the two biggest sources of slow, flaky tests. These patterns keep tests fast and deterministic.

## 1. Inject a clock for "what time is it?"

Anywhere your logic asks for the current time, ask an injected `Clock` instead of calling `Date.now()`:

```ts
export interface Clock { now(): number }
export const systemClock: Clock = { now: () => Date.now() };

class KvStore {
  constructor(private readonly clock: Clock) {}
  set(key: string, value: string, ttlSeconds?: number) {
    const expiresAt = ttlSeconds === undefined ? null : this.clock.now() + ttlSeconds * 1000;
    // ...
  }
}
```

In tests:

```ts
const clock = new ManualClock();
const store = new KvStore(clock);
store.set("a", "1", 10);
clock.advance(9_999);  expect(store.get("a")).toBeDefined();
clock.advance(1);      expect(store.get("a")).toBeUndefined();
```

Test the **boundary**: one millisecond before and exactly at expiry. Off-by-one errors (`<` vs `<=`) live there.

## 2. Timers: fake them for pure logic, keep them real around I/O

For a unit that only uses timers (like a debouncer), Vitest's fake timers are perfect:

```ts
import { vi } from "vitest";

it("coalesces calls", async () => {
  vi.useFakeTimers();
  const write = vi.fn(async () => {});
  const f = new DebouncedFlusher(write, 100);
  f.schedule(); f.schedule(); f.schedule();
  await vi.advanceTimersByTimeAsync(99);
  expect(write).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1);
  expect(write).toHaveBeenCalledTimes(1);
  vi.useRealTimers();
});
```

With real sockets and files involved (the acceptance tests), fake timers interfere with Node internals. There:

- make intervals short via options (`sweepIntervalMs: 20`)
- **poll for the outcome** instead of sleeping a fixed time:

```ts
await vi.waitFor(async () => {
  expect((await stats(base)).expired).toBe(2);
}, { timeout: 2_000, interval: 20 });
```

`await sleep(100)` is either too short on a slow CI machine (flaky) or too long everywhere (slow). Polling returns as soon as the condition holds.

## 3. One temp directory per test

```ts
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

let dir: string;
beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), "kv-lite-test-")); });
afterEach(async () => { await rm(dir, { recursive: true, force: true }); });
```

No test sees another's files, tests can run in parallel, and nothing touches your real data.

## 4. Always clean up servers and timers

```ts
afterEach(async () => { await app.kv.close(); });
```

If `close()` forgets to clear an interval, symptoms include "Vitest did not exit", tests that pass alone but fail together, and timers firing against a deleted temp dir. Making `close()` idempotent means cleanup in `afterEach` is safe even if the test already closed the server.

## 5. Simulating restarts

A restart is: close the first instance (which flushes), then create a new one with the same `dataFile` (and the same clock, if you want to control time across the restart). Advance the clock between them to test "TTL passed while down".

## 6. Testing atomicity (the honest version)

You can't easily crash a process at exactly the right instruction in a unit test. Practical options:

- **Assert the observable invariants**: after flushes, the file always parses; no `.tmp` files remain.
- **Inject the filesystem**: pass `{ writeFile, rename }` into the persistence module, and in a test make `rename` throw. Assert the original file is unchanged and the temp file was removed.
- **Process-level test**: spawn the server as a child process, hammer it with writes, `SIGKILL` it at random moments in a loop, and check the file always parses on restart. Slow, but it's how storage engines are really tested ("crash testing" / fault injection).

## 7. Testing that something does NOT happen

"No write happens during a burst" is a negative assertion. Make it concrete: expose a counter (`flushes` in `/stats`), assert it's `0` right after the burst, then wait for it to become `1`. Negative assertions without a positive follow-up pass trivially when the code is broken in a different way.
