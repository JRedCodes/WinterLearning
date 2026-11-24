# Build plan: from empty repo to green tests

A suggested order of work, one vertical slice at a time. Each step lists what to build and which tests should go green. Run `npm run test:watch -- <file>` to focus on one test file while you work (e.g. `npm run test:watch -- base62`).

The fixed points you can't change: `src/config.ts` (setting names), `src/container.ts`'s exported types and `createContainer` signature, `src/lib/base62.ts`'s two exports, and `src/db/migrate.ts`. Everything else is your design.

## Step 0: write DESIGN.md (45 min)

Fill in at least Requirements, Estimates, API and Data Model in `challenge/DESIGN.md` before coding. Sketch the high-level diagram. You'll revise it at the end; the point is to make decisions before the code makes them for you.

## Step 1: schema and base62 (45 min) → `base62.test.ts`

- `migrations/001_links.sql`: a `links` table (code as primary key, url, owner, created_at, expires_at) and a table for per-day click counts with a composite primary key `(code, day)`.
- Implement `toBase62` / `fromBase62` with `bigint`. Throw on negative input, empty strings and characters outside the alphabet.
- Add a `randomCode(length)` helper using `crypto.randomInt`.

## Step 2: the skeleton (1h) → first tests in `links.test.ts` and `redirect.test.ts`

Create the folders and the wiring, with the simplest possible implementation:

```
src/
  app.ts                       createApp(handlers) → express app (json parser, routes, 404, error handler)
  container.ts                 createContainer(deps) → { app, drainClicks }
  domain/link.ts, errors.ts    Link type, isExpired(), domain errors
  repositories/linkRepository.ts   interface + PgLinkRepository
  services/linkService.ts      create / resolve / getOwned / delete
  controllers/…  routes/…  middleware/…
```

- API key middleware (`X-API-Key` must be in `config.apiKeys`; put an owner id on `res.locals`).
- `POST /api/links` with a generated code, `GET /:code` reading straight from Postgres, the error handler with `{ error: { code, message } }`.
- `drainClicks` can return `0` for now.

## Step 3: validation, aliases, ownership (1h) → rest of `links.test.ts`

- A zod schema for the body (http/https only, ≤ 2048 chars, alias pattern, positive integer expiry), mapped to `400 VALIDATION_ERROR`. Malformed JSON → `400 INVALID_JSON`.
- Reserved aliases (`api`, `healthz`, `readyz`, ... compared case-insensitively) rejected in the service.
- Inserts with `ON CONFLICT (code) DO NOTHING RETURNING`: retry random codes, return `409 ALIAS_TAKEN` for aliases.
- `GET` and `DELETE /api/links/:code`, owner-only (404 for others).

## Step 4: the cache (1h) → `redirect.test.ts` cache group

- A `LinkCache` interface and a Redis implementation. Keys under `config.redisKeyPrefix`.
- Cache-aside in `resolve`, write-through in `create`.
- Wrap every Redis call so that failures behave like a miss.
- Check: "a repeated redirect makes no Postgres calls" and "shared between instances".

## Step 5: expiry, delete, negative caching (45 min) → remaining redirect tests

- Store `expiresAt` in the cached value, check it on hits, cap the TTL.
- Invalidate on delete (after the DB delete).
- Cache unknown codes briefly; make sure create overwrites that.

## Step 6: click analytics (1.5h) → `analytics.test.ts`

- `ClickRecorder.record(code, at)`: `XADD` to `${prefix}clicks`, fail-open.
- `drainClicks()`: ensure the consumer group exists, read batches with `XREADGROUP`, aggregate per (code, UTC day of the click), one upsert, `XACK`, loop until empty. Return the number of events consumed.
- `GET /api/links/:code/stats` → `{ code, totalClicks, daily: [{ date, clicks }] }`, days ascending.
- Handle clicks for deleted links without failing the batch.

## Step 7: rate limit and health (45 min) → `ratelimit.test.ts`, `health.test.ts`

- Fixed window per owner from the injected clock; `429 RATE_LIMITED` + `Retry-After`. Only on `POST /api/links`.
- `/healthz` (no dependency checks) and `/readyz` (Postgres + Redis with timeouts → 200/503).

## Step 8: architecture and docs (1h) → `architecture.test.ts`, `docs.test.ts`

- Make sure services and the HTTP layer don't import `pg`/`ioredis` (type-only imports are fine) and that only `config.ts` touches `process.env`.
- Finish `DESIGN.md` so it describes what you built (the tests check headings and minimum depth).
- Write `DECISIONS.md`: at least the redirect status code and code generation decisions.

## Finally: run it for real

```bash
make up && make migrate && make dev
curl -s localhost:3000/api/links -H 'x-api-key: dev-key-1' -H 'content-type: application/json' \
  -d '{"url":"https://example.com/hello","alias":"hello"}'
curl -i localhost:3000/hello
sleep 2
curl -s localhost:3000/api/links/hello/stats -H 'x-api-key: dev-key-1'
```

Then try the failure modes yourself: stop Redis (`docker compose stop redis`) and check that redirects still work and `/readyz` returns 503.
