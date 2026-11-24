# Hints · URL Shortener

Open one hint at a time. Give each a real try before opening the next.

## Getting the skeleton up

<details><summary>Hint 1</summary>

Get one request working end to end before anything else: a migration with a `links` table, `POST /api/links` inserting a row, `GET /:code` reading it. No cache, no clicks. `drainClicks` can be `async () => 0` for now.
</details>

<details><summary>Hint 2</summary>

`createContainer` is just construction: `new PgLinkRepository(pool)` → `new LinkService({ links, clock, ... })` → controllers → `createApp(...)`. Return `{ app, drainClicks: () => analytics.drain() }`. Keep `app.ts` free of `new` calls for repositories; it receives ready handlers or services.
</details>

<details><summary>Hint 3</summary>

Route order in `app.ts`: `express.json()`, `/healthz`, `/readyz`, `app.use("/api", apiRouter)`, then `app.get("/:code", redirect)`, then a 404 handler, then the error handler. The redirect route must come after `/api` and the health checks, or it will swallow them.
</details>

## Base62 and codes

<details><summary>Hint 1</summary>

Encoding is repeated division: the remainder `n % 62n` is the last digit, then `n /= 62n`. Decoding is `n = n * 62n + indexOf(char)` for each character.
</details>

<details><summary>Hint 2</summary>

For random codes, `crypto.randomInt(62)` picks one character index without bias. Seven of those make a code.
</details>

<details><summary>Hint 3</summary>

`INSERT ... ON CONFLICT (code) DO NOTHING RETURNING *` returns zero rows when the code is taken. Generated code: loop up to ~5 times. Alias: zero rows → throw `AliasTakenError` → 409. This is what makes the 20-concurrent-requests test pass without any locking code.
</details>

## Validation

<details><summary>Hint 1</summary>

`new URL(s)` throws on garbage; then check `url.protocol` is `"http:"` or `"https:"`. Wrap it in a zod `.refine()`.
</details>

<details><summary>Hint 2</summary>

`z.number().int().positive()` rejects `-1`, `0` and `1.5`. Reserved aliases are a business rule: check them in the service with a case-insensitive comparison and throw your validation error.
</details>

## The cache

<details><summary>Hint 1</summary>

The test that counts Postgres calls resets the counter *after* the first visit. So the first redirect may query Postgres (cache-aside) or not (write-through on create); the second must not, and neither may click recording.
</details>

<details><summary>Hint 2</summary>

Cache `{ url, expiresAt }` as JSON under `${prefix}link:${code}`. On a hit, compare `expiresAt` with `clock()`. TTL: `Math.min(cacheTtlSeconds, secondsUntilExpiry)`.
</details>

<details><summary>Hint 3</summary>

Wrap every cache method in `try/catch` and treat errors as a miss (`get`) or a no-op (`set`/`delete`). For negative caching store something like `{"missing":true}` with a short TTL, and make `create` write the real entry so it overwrites any negative one. Delete the key in `delete()` after the SQL delete.
</details>

## Click analytics

<details><summary>Hint 1</summary>

Record after the expiry check, with `XADD ${prefix}clicks * code <code> ts <ms>`. Await it (it's fast) so the click is in Redis before the response is sent, but catch errors so a broken Redis doesn't fail the redirect.
</details>

<details><summary>Hint 2</summary>

`drainClicks`: `XGROUP CREATE key group 0 MKSTREAM` (ignore the BUSYGROUP error), then loop `XREADGROUP GROUP group consumer COUNT 500 STREAMS key >` until it returns nothing. Each consumer needs a name; a random one per container works. Remember the reply shape: `[[streamKey, [[id, [field, value, ...]], ...]]]` or `null`.
</details>

<details><summary>Hint 3</summary>

For each batch: build a `Map` keyed by `code + day` (day = `new Date(ts).toISOString().slice(0, 10)`), then one `INSERT ... SELECT FROM unnest($1::text[], $2::text[], $3::bigint[]) ... ON CONFLICT (code, day) DO UPDATE SET clicks = click_daily.clicks + EXCLUDED.clicks`, filtered with `WHERE EXISTS (SELECT 1 FROM links ...)` so deleted links don't violate the foreign key. Then `XACK` (and `XDEL`) the batch ids. `bigint` columns come back as strings: `Number()` them for the stats response, and use `to_char(day, 'YYYY-MM-DD')` to avoid timezone surprises with `date`.
</details>

## Rate limiting

<details><summary>Hint 1</summary>

The window start is `Math.floor(clock().getTime() / windowMs) * windowMs`. Put it in the key so moving the clock to the next window gives a fresh counter.
</details>

<details><summary>Hint 2</summary>

`redis.multi().incr(key).pexpire(key, windowMs * 2).exec()` → the first reply is the count. Allowed if `count <= max`. `Retry-After` = `Math.ceil((windowStart + windowMs - now) / 1000)`. Run the middleware after API-key auth so you know whose limit it is, and before the controller so rejected requests create nothing.
</details>

## Health

<details><summary>Hint 1</summary>

`/readyz`: run `pool.query("SELECT 1")` and `redis.ping()` with a timeout (`Promise.race` against a timer) and return 503 if either fails. Keep the actual `pool`/`redis` calls in a repository-level module so services don't import the drivers.
</details>

## Architecture test

<details><summary>Hint 1</summary>

Services may depend on repository **interfaces** with `import type { LinkRepository } from "../repositories/linkRepository.js"`. Type-only imports are erased at compile time and are allowed; importing `pg` or `ioredis` values in services or controllers is not.
</details>
