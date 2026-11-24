# Challenge · Link Preview Service

**Type:** 🛠️ Build (from scratch) · **Est:** 6–7h · **Services:** Postgres, Redis

## Scenario

> **#chat-platform** · *Lena (staff engineer):* We need an "unfurl" service for links pasted into chat. Clients POST a URL. If we know the preview, return it; if not, accept the request, fetch the page in the background and let them poll. Viral links get pasted thousands of times a minute, so one fetch per URL, please. Partners get API keys and a per-key rate limit. Previews live in Postgres; Redis is for speed and coordination. I've written the contract (`src/contract.ts`) and the acceptance tests. The design is yours. Show me something I'd be happy to run.

## Your task

Build the service in `challenge/src/`. The only fixed points are:

- `src/contract.ts` (given, don't edit): types shared with the tests.
- `src/system.ts` must export `createSystem(options: SystemOptions): Promise<System>`. It's currently a stub.
- `src/server.ts` must exist and start the service from `src/config.ts` (the only file allowed to read `process.env`).

Everything else (folders, classes, SQL, key names) you design. Read the [lesson](README.md) first: it walks through the design. The full HTTP contract is in [docs/api-spec.md](docs/api-spec.md). In short:

1. `GET /health` → 200 (no key).
2. `POST /previews {url}`: 401 without a valid `X-API-Key`; 429 over the per-key limit; 400 for invalid URLs; 200 + preview if known; otherwise 202 + `{status: "pending", jobId}` + `Location`, and **exactly one** background fetch per normalized URL.
3. `GET /previews?url=`: 200 (known) / 202 (pending) / 404 (never requested). Never starts work.
4. Worker: fetch via the injected `fetcher`, retry transient errors (`jobs.attempts`, `jobs.backoffMs`), don't retry `PermanentFetchError`, store `ready` or `failed` in Postgres, cache ready previews in Redis with `cacheTtlSeconds`.
5. All Redis keys under `wl:21:<namespace>:` (including BullMQ's, via `prefix`).
6. `close()` is graceful (an in-flight fetch finishes and is saved) and idempotent.
7. Fill in `challenge/DECISIONS.md` with at least 3 decisions.

## Acceptance criteria

**`test/previews.test.ts`**
- [ ] `/health` without a key; 401 `UNAUTHORIZED` for missing or unknown keys, with no fetch
- [ ] 400 `VALIDATION_FAILED` for missing, non-string, relative, non-http(s) and over-2048-char URLs
- [ ] New URL → 202 pending + jobId + `Location`, then GET eventually returns `ready` with title/description/imageUrl/fetchedAt
- [ ] Known URL → 200 without fetching again
- [ ] 20 concurrent POSTs for one URL → all 202, one jobId, one fetch
- [ ] `#fragment` and host-case variants map to the same normalized URL, job and fetch
- [ ] GET: 400 without url, 404 for unknown, 202 pending while the job runs
- [ ] Transient failures retried; after the last attempt the preview is `failed` with the error; `PermanentFetchError` is not retried
- [ ] Ready previews persist in Postgres (a second system with an empty Redis namespace returns 200 without fetching)
- [ ] Ready previews are cached as a string key under the namespace with TTL ≤ `cacheTtlSeconds`
- [ ] Per-key rate limit: 429 `RATE_LIMITED` + `Retry-After` after the limit, other keys unaffected, shared across two instances with the same namespace
- [ ] `close()` waits for the active fetch to complete and be persisted

**`test/architecture.test.ts`**
- [ ] `src/services/` and `src/repositories/` contain code; `src/server.ts` exists
- [ ] `process.env` only in `src/config.ts`
- [ ] `src/services/**` imports none of `express`, `pg`, `ioredis`, `bullmq`
- [ ] `src/repositories/**` doesn't import `express`
- [ ] Routes/controllers/middleware exist and don't import `pg`

- [ ] `npm test` and `npm run typecheck` pass

## Getting started

```bash
cd 21-checkpoint-redis/challenge
make install
make up          # Postgres :5433 (db wl_21, created by the tests) + Redis :6380 (db 5)
make test        # everything fails: you're starting from an empty system.ts
```

Work in small steps. The lesson's section 8 has a suggested order. `npx vitest -t "health"` runs a single test.

Once `server.ts` works:

```bash
make dev
curl -s -XPOST localhost:3000/previews -H 'x-api-key: dev-key-1' -H 'content-type: application/json' -d '{"url":"https://example.com"}'
curl -s 'localhost:3000/previews?url=https://example.com/' -H 'x-api-key: dev-key-1'
```

## Rules

- Don't modify the tests or `src/contract.ts`.
- `pg` for Postgres (no ORM), `ioredis` + `bullmq` for Redis. The dependencies in `package.json` are all you need.
- Business logic in services that depend on interfaces (ports); infrastructure in adapters; wiring in one composition root.
- No `setTimeout`-based "queues". Background work goes through BullMQ.

## Stretch goals

1. **Graceful degradation:** if Redis is down, serve from Postgres (skip the cache) and fail open on the rate limit for GET. Write a test with a dead Redis connection for the cache adapter.
2. **Stale-while-revalidate:** previews older than N days are returned immediately and a refresh job is enqueued (deduped the same way).
3. **Retry failed previews:** a POST for a `failed` preview older than 1 hour enqueues a new attempt.
4. **SSRF protection** in `HttpMetadataFetcher`: resolve the host and refuse private/loopback/link-local ranges (see module 25).
5. **Per-domain politeness:** at most 2 concurrent fetches per domain (BullMQ groups are a Pro feature; how else could you do it?).
6. **Metrics:** cache hit ratio, queue depth and fetch failures by reason at `/metrics` (preview of module 24).

## Done?

1. `npm test` is green and `npm run typecheck` is clean. `DECISIONS.md` is filled in.
2. Commit on your branch `module/21-checkpoint-redis`, push and open a PR. CI runs this module's tests.
3. From the repo root: `npm run progress -- 21` to tick it off on the roadmap.
4. Answer the questions in [INTERVIEW.md](INTERVIEW.md).
5. Add an entry to [LOG.md](../LOG.md). This is a checkpoint, so note what felt hard.
6. Compare with the reference solution: `git diff main origin/solutions -- 21-checkpoint-redis/` (and read `SOLUTION.md` on that branch). Your structure doesn't need to match; compare the decisions.

Stuck? → [HINTS.md](HINTS.md)
