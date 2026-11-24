# Hints · Caching

Open one hint at a time. Give each a real try before opening the next. Run a single test file with `npx vitest run test/ttl.test.ts`.

## TODO 1: `ttlWithJitter`

<details><summary>Hint 1</summary>

Turn `random()` (0 to 1) into a factor that runs from `1 - ratio` to `1 + ratio`, then multiply by the base.
</details>

<details><summary>Hint 2</summary>

`2 * random() - 1` maps [0, 1) onto [-1, 1). Multiply that by `jitterRatio` and add 1.
</details>

<details><summary>Hint 3</summary>

`Math.max(1, Math.round(baseSeconds * (1 + jitterRatio * (2 * random() - 1))))`
</details>

## TODO 2: Cache-aside

<details><summary>Hint 1</summary>

Three steps: ask the cache, return on a hit, otherwise ask `inner` and write the answer to the cache before returning it. Record exactly one hit or miss per call.
</details>

<details><summary>Hint 2</summary>

`this.cache.get(productCacheKey(id))` gives `string | null`. On a hit, `JSON.parse`. On a miss, `JSON.stringify` the product and `this.cache.set(key, json, ttlWithJitter(...))`. The randomness comes from `this.options.random ?? Math.random`.
</details>

<details><summary>Hint 3</summary>

Test `toEqual` failing on a cache hit with a date mismatch? Look at what type `updatedAt` has in the domain and why (`src/domain/product.ts`). You shouldn't need to convert anything.
</details>

## TODO 3: Negative caching

<details><summary>Hint 1</summary>

Right now, a `null` from `inner` isn't written to the cache at all. Write *something* that means "not found".
</details>

<details><summary>Hint 2</summary>

Pick a sentinel string that a real entry can never equal. Real entries are JSON objects, so they always start with `{`. Store it with `negativeTtlSeconds`.
</details>

<details><summary>Hint 3</summary>

On read: `if (cached !== null) { hit; return cached === NOT_FOUND ? null : JSON.parse(cached); }`. Order matters: check for the sentinel before parsing.
</details>

## TODO 4: Invalidation

<details><summary>Hint 1</summary>

Two steps, and the order matters. Which one is the source of truth?
</details>

<details><summary>Hint 2</summary>

`await this.inner.update(...)` first, then `await this.cache.del(key)`. Section 4 of the lesson explains why deleting beats setting, and why the database goes first.
</details>

## TODO 5: Request coalescing

<details><summary>Hint 1</summary>

You need to remember, per id, "a load is already running, here's its promise". Where would a `Map` live so all calls share it?
</details>

<details><summary>Hint 2</summary>

A private field `#inFlight = new Map<string, Promise<Product | null>>()`. After a miss: if the map has the id, record coalesced and return that promise. Otherwise create the load promise, put it in the map **without awaiting anything in between**, and return it.
</details>

<details><summary>Hint 3</summary>

Move "load from inner + write to cache" into a private method. Then:
```ts
const load = this.#loadAndFill(id).finally(() => this.#inFlight.delete(id));
this.#inFlight.set(id, load);
return load;
```
`finally` runs on success and on failure, which is what the "failed load is not remembered" test needs.
</details>

## TODO 6: Fail open

<details><summary>Hint 1</summary>

Every `this.cache.*` call can throw. Which of them can you simply skip when they fail?
</details>

<details><summary>Hint 2</summary>

All of them: a failed `get` is a miss, a failed `set` just means no caching this time, and a failed `del` leaves a stale entry the TTL will clean up. Wrap each call in `try/catch`, and call `this.metrics.recordError()` in the catch.
</details>

<details><summary>Hint 3</summary>

Avoid repeating `try/catch` three times with a small helper:
```ts
async #safe<T>(op: () => Promise<T>, fallback: T): Promise<T> { try { ... } catch { ...; return fallback; } }
```
</details>

## TODO 7: Metrics

<details><summary>Hint 1</summary>

`snapshot()` returns the four counters plus a ratio. What should the ratio be when nothing has happened yet?
</details>

<details><summary>Hint 2</summary>

`hitRatio = lookups === 0 ? 0 : hits / lookups`, where `lookups = hits + misses`. The route is `router.get("/cache", ...)`, because the router is mounted at `/metrics`.
</details>

<details><summary>Hint 3</summary>

`res.set("Cache-Control", "no-store").json(metrics.snapshot())`
</details>
