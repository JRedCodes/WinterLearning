# Challenge · Product Details Cache

**Type:** 🧩 Scaffold · **Est:** 3–4h · **Services:** Postgres, Redis

## Scenario

> **Ticket SHOP-1182 · Product page p95 latency is 230 ms, DB CPU at 85% during sales**
>
> The product details query is expensive (pricing, inventory and reviews joins, simulated here with `pg_sleep`), and the same ~2,000 products get almost all the traffic. Last Black Friday a hot product's cache entry in the old monolith expired and the database fell over (we think it was a stampede). Requirements from the postmortem:
>
> 1. Cache product reads in Redis, but **behind the repository interface**. The service layer must not change.
> 2. TTLs must be jittered so warmed keys don't expire together.
> 3. Updates must be visible on the next read.
> 4. Requests for non-existent products must not reach the database every time (a crawler did this to us).
> 5. 100 simultaneous misses for one product must cause **one** query.
> 6. If Redis is down, the page must still work (slower).
> 7. We want hit/miss numbers at `/metrics/cache` so we can see whether this works.
>
> *— Dana, Platform team*

The app in `challenge/` already works end to end, just without caching: `CachedProductRepository` is a pass-through. Your job is to make it a real cache.

## Your task

Work through the numbered `TODO(n)` comments:

| TODO | File | What |
|---|---|---|
| 1 | `src/cache/ttl.ts` | `ttlWithJitter(base, ratio, random)` |
| 2 | `src/repositories/cachedProductRepository.ts` | Cache-aside `findById`: hit/miss, JSON, jittered TTL, metrics |
| 3 | same | Negative caching of "not found" with the short TTL |
| 4 | same | Invalidation: `update` writes the DB, then deletes the cache entry |
| 5 | same | Request coalescing: concurrent misses for one id share one load |
| 6 | same | Fail open: cache errors are counted, never fatal |
| 7 | `src/cache/cacheMetrics.ts`, `src/routes/metrics.ts` | `snapshot()` with hit ratio, and `GET /metrics/cache` |

Read the big comment at the top of `CachedProductRepository` and the counting rules in `CacheMetrics` before you start. Everything you need is already wired in `server.ts`.

### Architecture (already in place)

```
src/
  app.ts                 createApp({ productService, cacheMetrics })
  server.ts              composition root: wires Pg repo -> CachedProductRepository -> ProductService
  config.ts              zod-parsed env (TTL, jitter, negative TTL, query delay)
  domain/product.ts      Product (JSON-safe!), ProductPatch, ProductNotFoundError
  services/              ProductService (no caching code, and it stays that way)
  controllers/ routes/   HTTP only
  repositories/
    productRepository.ts        the interface
    pgProductRepository.ts      slow source of truth (don't change)
    cachedProductRepository.ts  ← your decorator
  cache/
    cache.ts             Cache interface + RedisCache
    ttl.ts               ← TODO 1
    cacheMetrics.ts      ← TODO 7a
  db/                    migrate, seed, setup script
```

## Acceptance criteria

- [ ] **TTL jitter:** `ttlWithJitter` maps `random()` linearly onto `[base·(1−ratio), base·(1+ratio)]`, rounds, never returns < 1, and spreads values with the default `Math.random`.
- [ ] **Cache-aside:** a repeated read is served from Redis without calling the inner repository. Entries are JSON at `wl:18:product:v1:<id>`, round-trip to an identical object, and have a TTL with jitter.
- [ ] **Negative caching:** repeated lookups of a missing id call the inner repository once, return `null`, count as hits, and use the negative TTL.
- [ ] **Invalidation:** after `update`, the cache entry is gone and the next read returns new data (also through HTTP with real Postgres).
- [ ] **Coalescing:** 100 concurrent misses for one id → 1 inner call (misses = 100, coalesced = 99). Coalescing is per id, works for missing ids, a failed load rejects all its waiters and isn't remembered, and a settled load isn't reused.
- [ ] **Fail open:** with a cache whose every operation throws, reads and updates still work and errors are counted.
- [ ] **Metrics:** `snapshot()` returns `{ hits, misses, coalesced, errors, hitRatio }` (hitRatio 0 before any lookup), served at `GET /metrics/cache` with `Cache-Control: no-store`.
- [ ] **End to end:** 50 concurrent `GET /products/2` on a cold cache make one Postgres query.
- [ ] `npm test` and `npm run typecheck` pass.

## Getting started

```bash
cd 18-caching/challenge
make install
make up          # Postgres on 5433, Redis on 6380
make test        # tests create the wl_18 database themselves
```

To run the API and feel the difference:

```bash
make db-setup    # creates wl_18, migrates, seeds 3 products
make dev
curl -s -w '  %{time_total}s\n' localhost:3000/products/1   # ~0.2s (miss)
curl -s -w '  %{time_total}s\n' localhost:3000/products/1   # ~0.002s once you've built the cache
curl -s localhost:3000/metrics/cache
curl -s -X PATCH localhost:3000/products/1 -H 'content-type: application/json' -d '{"priceCents": 49900}'
make redis-cli   # then: SCAN 0 MATCH wl:18:*  /  TTL wl:18:product:v1:1
```

## Rules

- Don't modify the tests.
- Don't change `ProductService`, the `ProductRepository` interface or `PgProductRepository`. Caching lives only in the decorator (plus `ttl.ts`, metrics and the metrics route).
- `CachedProductRepository` depends on the `Cache` interface, not on ioredis.
- No caching libraries: the point is to understand the mechanics.

## Stretch goals

1. **L1 cache:** add an in-process LRU layer (max N entries, 5 s TTL) in front of Redis as another decorator, and wire it in `server.ts`. What happens to invalidation with two app instances?
2. **Stale-while-revalidate:** store `{ value, freshUntil }`, serve stale values while one background refresh runs (see [docs/stampedes-and-consistency.md](docs/stampedes-and-consistency.md)).
3. **Cross-process stampede protection:** on a miss, take a short Redis lock (module 17). Losers poll the cache briefly before falling back to the database.
4. **HTTP caching:** send `Cache-Control: public, max-age=30` and an `ETag` on `GET /products/:id`, and handle `If-None-Match` → 304.
5. **Version-safe writes:** close the slow-reader race from the lesson (section 13) with a Lua script that only stores a value whose `updatedAt` is newer than or equal to what's cached.
6. Measure: write a quick script firing 1,000 requests over 20 products, with and without the cache, and record p50/p95 in your LOG.md.

## Done?

1. `npm test` is green and `npm run typecheck` is clean.
2. Commit on your branch `module/18-caching`, push and open a PR. CI runs this module's tests. Ask Claude to review the PR if you want feedback.
3. From the repo root: `npm run progress -- 18` to tick it off on the roadmap.
4. Answer the questions in [INTERVIEW.md](INTERVIEW.md).
5. Add an entry to [LOG.md](../LOG.md).
6. Compare with the reference solution: `git diff main origin/solutions -- 18-caching/` (and read `SOLUTION.md` on that branch).

Stuck? → [HINTS.md](HINTS.md)
