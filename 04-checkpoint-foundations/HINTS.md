# Hints · Checkpoint: Foundations

Open one hint at a time. This is a checkpoint, so try hard before opening anything, and prefer re-reading the lesson first.

## Getting started / structure

<details><summary>Hint 1</summary>

Write down the four responsibilities (key/value rules, file persistence, HTTP, startup/shutdown) and give each its own file or folder before writing any logic. `src/index.ts` should end up as the place that *connects* things, not the place that *does* things.
</details>

<details><summary>Hint 2</summary>

Make the store a class that takes a `Clock` and an `onChange` callback in its constructor. It never imports `node:http` or `node:fs`. You could unit test it with a `ManualClock` and no server at all.
</details>

<details><summary>Hint 3</summary>

Order inside `createKvServer`: load snapshot → create flusher (its write function reads `store.snapshot()`) → create store with `onChange: () => flusher.schedule()` → create the http server with a request handler that receives the store → start the sweeper interval → return `{ server, listen, close }`.
</details>

## TTL and expiry

<details><summary>Hint 1</summary>

Store `expiresAt: number | null` (absolute ms). A key is expired when `expiresAt !== null && expiresAt <= clock.now()`. The test checks the exact millisecond, so mind `<` vs `<=`.
</details>

<details><summary>Hint 2</summary>

Write one private method, say `#live(key)`, that returns the entry if it's live and otherwise deletes it (counting `expired++`) and returns `undefined`. Use it in `get`, `set` (to decide 201 vs 200) and `delete`. Then lazy expiry is consistent everywhere.
</details>

<details><summary>Hint 3</summary>

`size()` and `snapshot()` must filter expired entries too, because the sweeper may not have run yet. `sweep()` loops over the Map (deleting during `for...of` over a Map is safe), counts removals, and calls `onChange()` if anything was removed.
</details>

## HTTP

<details><summary>Hint 1</summary>

With two routes, a regex beats a router: `/^\/kv\/([^\/]+)$/` captures the key segment. Decode it inside `try/catch` and validate it with `/^[A-Za-z0-9._:-]{1,200}$/`.
</details>

<details><summary>Hint 2</summary>

`url.searchParams.get("ttl")` is `string | null`. Validate with `/^\d+$/` before `Number()`, then check the 1–31,536,000 range. Validate the TTL *before* reading the body, so a bad request stores nothing.
</details>

<details><summary>Hint 3</summary>

Reuse the body reader from module 03, minus the JSON parsing: count bytes, throw a 413 past the limit, return `Buffer.concat(chunks).toString("utf8")`. Respond to GET with the stored content type and `Buffer.byteLength(value)` as `Content-Length`.
</details>

## Persistence

<details><summary>Hint 1</summary>

Loading: `readFile` inside `try/catch`, return `[]` when `error.code === "ENOENT"`, rethrow anything else. Then `JSON.parse` into `unknown` and check the shape with type predicates; throw a descriptive error if anything is off.
</details>

<details><summary>Hint 2</summary>

Atomic write: `mkdir(dirname(file), { recursive: true })`, write to `` `${file}.${process.pid}.${random}.tmp` ``, then `rename(tmp, file)`. In a `catch`, `rm(tmp, { force: true })` and rethrow.
</details>

<details><summary>Hint 3</summary>

Debounced flusher with no overlaps:

```ts
schedule() { dirty = true; clearTimeout(timer); timer = setTimeout(() => flushNow().catch(log), delay); }
flushNow() {
  clearTimeout(timer);
  const next = running.then(async () => {
    if (!dirty) return;
    dirty = false;            // BEFORE writing: changes during the write re-mark it
    try { await write(); flushes++; } catch (e) { dirty = true; throw e; }
  });
  running = next.catch(() => {});
  return next;
}
```
</details>

## Lifecycle

<details><summary>Hint 1</summary>

`close()` order: `clearInterval(sweeper)` → `server.close()` (wrapped in a promise) plus `server.closeIdleConnections()` → `await flusher.flushNow()`.
</details>

<details><summary>Hint 2</summary>

For idempotency, store the promise: `closing ??= (async () => { ... })(); return closing;`. Only call `server.close()` if `server.listening`, otherwise it errors with "Server is not running".
</details>

<details><summary>Hint 3</summary>

`listen(port = 0, host = "127.0.0.1")` returns a promise that resolves with `(server.address() as AddressInfo).port` in the listen callback. `AddressInfo` comes from `node:net`. This is the one place an `as` is reasonable: `address()` returns a union that includes `string` for pipe servers, and you know you listened on TCP.
</details>
