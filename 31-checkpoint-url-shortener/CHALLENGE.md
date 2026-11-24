# Challenge · URL Shortener, end to end

**Type:** 🛠️ Build (from a spec) · **Est:** 8–10h · **Services:** Postgres (5433), Redis (6380)

## Scenario

> **#growth-eng** · *Marco (eng manager):* Marketing pays a SaaS shortener a silly amount for campaign links, and legal doesn't love sending every click to a third party. Can you build us our own? I need: short links (custom aliases for campaigns), expiry, click counts per day, and it must not fall over when a campaign email goes to 2M people at 9am. Partners will create links through the API with keys, so rate limit them. Write the design doc first and run it past me; I'd rather argue about the cache now than in an incident review. 😄

## Your task

Build the service in `challenge/` from (nearly) scratch. You get: `package.json`, `tsconfig.json`, `docker-compose.yml`, `src/config.ts` (env parsing, complete), `src/db/migrate.ts` (migration runner, complete), `src/server.ts` (process entry point, complete), the contract stubs in `src/container.ts` and `src/lib/base62.ts`, templates for `DESIGN.md` and `DECISIONS.md`, and the acceptance tests.

1. **Design first.** Fill in `DESIGN.md` (module 30's template) as a plan: at least requirements, estimates, API and data model, before you write code. Finish it at the end so it describes what you built.
2. **Schema:** write `migrations/001_*.sql` (and more if you like).
3. **Base62:** implement `toBase62` / `fromBase62` in `src/lib/base62.ts`.
4. **Wire the app** behind `createContainer()` in `src/container.ts`, with a layered structure: `app.ts`, `routes/` or `controllers/`, `services/`, `repositories/`, `domain/`, `middleware/`.
5. Implement the API below, the Redis-cached redirect, async click analytics, rate limiting and health checks.
6. **Write `DECISIONS.md`:** at least the redirect status code (301 vs 302) and how codes are generated.

[docs/build-plan.md](docs/build-plan.md) suggests an order with the matching test files for each step.

### The contract with the tests

```ts
// src/container.ts (keep these names and shapes)
export type Clock = () => Date;
export interface ContainerDeps { config: AppConfig; pool: pg.Pool; redis: Redis; clock?: Clock }
export interface Container { app: Express; drainClicks(): Promise<number> }
export function createContainer(deps: ContainerDeps): Container;
```

- Use the **injected** `pool`, `redis` and `clock` for everything (the tests count pool calls, move the clock, and swap in a broken Redis client). Don't close them; the caller owns them.
- Every Redis key starts with `config.redisKeyPrefix` (`wl:31:`).
- `drainClicks()` processes **all** pending click events and resolves with how many it consumed.
- Tests may build **two containers** sharing the same pool and Redis to simulate two instances.

### API specification

All `/api/*` routes require an `X-API-Key` header containing one of `config.apiKeys`. Every error response is:

```json
{ "error": { "code": "SOME_CODE", "message": "Human readable" } }
```

`Link` (the JSON shape of a link): `{ "code", "shortUrl", "url", "createdAt", "expiresAt" }`, where `shortUrl` is `${config.publicBaseUrl}/${code}`, timestamps are ISO-8601 strings from the injected clock, and `expiresAt` is `null` when the link doesn't expire.

| Endpoint | Success | Errors |
|---|---|---|
| `POST /api/links` body `{ url, alias?, expiresInSeconds? }` | `201 { data: Link }`, `Location: /api/links/{code}` | `400 VALIDATION_ERROR`, `400 INVALID_JSON`, `401 UNAUTHORIZED`, `409 ALIAS_TAKEN`, `429 RATE_LIMITED` |
| `GET /api/links/{code}` | `200 { data: Link }` | `401`, `404 NOT_FOUND` (unknown **or owned by another key**) |
| `DELETE /api/links/{code}` | `204`, empty body | `401`, `404 NOT_FOUND` (unknown or not yours) |
| `GET /api/links/{code}/stats` | `200 { data: { code, totalClicks, daily: [{ date: "YYYY-MM-DD", clicks }] } }` | `401`, `404 NOT_FOUND` |
| `GET /{code}` (no key needed) | `301` or `302` with `Location: <url>` | `404 NOT_FOUND`, `410 LINK_EXPIRED` |
| `GET /healthz` | `200 { status: "ok" }` | |
| `GET /readyz` | `200 { status: "ready" }` | `503` when Postgres or Redis doesn't respond |
| any other route | | `404` JSON error |

**Validation rules for `POST /api/links`:**
- `url`: required string, at most 2,048 characters, an absolute `http:` or `https:` URL (reject `ftp:`, `javascript:`, garbage).
- `alias` (optional): 4–32 characters of `A-Z a-z 0-9 _ -`; not a reserved word (at least `api`, `healthz`, `readyz`, compared case-insensitively); unique across aliases **and** generated codes.
- `expiresInSeconds` (optional): a positive integer.
- Generated codes: exactly **7 base62 characters** (`[0-9A-Za-z]{7}`), unique, not sequential.

**Behaviour:**
- Redirects for an existing, unexpired link are served **from Redis on repeat visits, with zero Postgres calls**, from any instance.
- Expiry is enforced on cached links too. Deleting a link takes effect immediately, even if it was cached. A code that returned 404 works as soon as it's created.
- If Redis is unreachable, redirects still work (from Postgres).
- Each successful redirect records a click with the clock's current time. The redirect path **never writes to Postgres**: clicks are buffered in Redis and aggregated into Postgres by `drainClicks()`. Stats count only aggregated clicks, grouped by the **UTC day of the click**.
- Clicks are not recorded for unknown or expired links. Clicks for links deleted before a drain are dropped without breaking the drain.
- `POST /api/links` is limited to `config.rateLimit.max` requests per `config.rateLimit.windowSeconds` **per API key**, shared across instances, exact under concurrency, with windows based on the injected clock. Over the limit: `429 RATE_LIMITED` with an integer `Retry-After` header (1 to window seconds). Rejected requests create nothing. Redirects aren't limited.

## Acceptance criteria

- [ ] `base62.test.ts`: encode/decode with the `0-9A-Za-z` alphabet, round-trips, rejects bad input.
- [ ] `links.test.ts`: auth (401), create with generated code / alias / expiry, `Location` header, unique codes, 409 on duplicate alias, exactly one winner among 20 concurrent alias requests, 14 validation cases, malformed JSON, owner-only get/delete.
- [ ] `redirect.test.ts`: 301/302 with `Location`, 404, 410 after expiry, zero Postgres calls on repeat redirects, cache shared across instances, expiry and deletion honoured on cached links, no stale negative cache, works with Redis down.
- [ ] `analytics.test.ts`: zero stats at first, clicks counted only after `drainClicks()`, per-UTC-day buckets, idempotent drains, cross-instance draining, no clicks for unknown/expired links, deleted links don't break the drain, owner-only stats.
- [ ] `ratelimit.test.ts`: limit + `Retry-After`, nothing created when limited, per key, window reset via the clock, exact across two instances under concurrency, redirects unlimited.
- [ ] `health.test.ts`: `/healthz`, `/readyz` 200, `/readyz` 503 with Redis down.
- [ ] `architecture.test.ts`: `app.ts` + non-empty `services/`, `repositories/`, `controllers/` or `routes/`; only `config.ts` reads `process.env`; no `express` in services/repositories/domain; no `pg`/`ioredis` value imports in routes/controllers/middleware/services/domain.
- [ ] `docs.test.ts`: `DESIGN.md` has all eight sections of module 30's template with real content (mermaid diagram, numbers, 2+ deep dives); `DECISIONS.md` has 2+ decisions with Context / Options considered / Decision / Consequences and discusses 301 vs 302.
- [ ] `npm run typecheck` is clean.

## Getting started

```bash
cd 31-checkpoint-url-shortener/challenge
make install
make up          # Postgres on 5433, Redis on 6380
make test        # everything fails: createContainer() throws "Not implemented"
```

Once things pass, run it for real:

```bash
make migrate && make dev
curl -s localhost:3000/api/links -H 'x-api-key: dev-key-1' -H 'content-type: application/json' -d '{"url":"https://example.com","alias":"hello"}'
curl -i localhost:3000/hello
```

Inspect what you're storing with `make psql` (database `wl_31`) and `make redis-cli` (DB index 15, keys under `wl:31:`).

## Rules

- Don't modify the tests, `src/db/migrate.ts`, or the exported names and types in `src/container.ts` and `src/lib/base62.ts`. You may add settings to `src/config.ts`.
- No ORM. `pg`, `ioredis`, `express` and `zod` are installed; you shouldn't need more.
- Layered architecture: HTTP concerns stay in routes/controllers/middleware, business rules in services, SQL and Redis commands in repositories. Only `config.ts` reads the environment.
- Use the injected clock for every "now".

## Stretch goals

1. **List endpoint:** `GET /api/links?cursor=...&limit=...` with keyset pagination over `(created_at, code)` (module 14).
2. **Exactly-once counting:** store the last processed stream id in Postgres in the same transaction as the counts, and prove with a test that a redelivered batch isn't double counted.
3. **Hot-key protection:** add an in-process LRU (a few seconds of TTL) in front of Redis for the redirect, and explain in `DESIGN.md` what it does to deletion latency.
4. **Observability:** a `/metrics` endpoint with redirect latency histograms, cache hit/miss counters and stream length (module 24).
5. **Tombstones:** on delete, write a short negative-cache entry instead of deleting the key, and argue in `DECISIONS.md` which race it closes.
6. **Load test:** a k6 script (module 29) for 1,000 redirects/s against a few hot codes; record p99 with and without the cache.

## Done?

1. `npm test` and `npm run typecheck` are green.
2. Commit on your branch `module/31-checkpoint-url-shortener`, push and open a PR. Ask Claude to review it like Marco would: design doc first, then the code.
3. From the repo root: `npm run progress -- 31` to tick it off on the roadmap.
4. Answer the questions in [INTERVIEW.md](INTERVIEW.md).
5. Add an entry to [LOG.md](../LOG.md): what did your design get wrong before you wrote the code?
6. Compare with the reference solution: `git diff main origin/solutions -- 31-checkpoint-url-shortener/` (and read `SOLUTION.md` on that branch).

Stuck? → [HINTS.md](HINTS.md)
