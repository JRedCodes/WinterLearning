# Design walkthrough: from ask to architecture

This is how a senior engineer might think through this service on a whiteboard, in the order the questions come up. Use it as a template for your own designs (and for interviews).

## Step 1: Clarify

Questions worth asking the chat team before writing anything:

- *How fresh must previews be?* "A day old is fine." → long cache TTLs; refresh is a later feature.
- *What latency do clients expect?* "Show the card when it's ready; the message itself must never wait." → async is acceptable, so 202 + poll.
- *What volume?* "Peak 2,000 POSTs/s, heavily skewed: a few links are pasted thousands of times." → caching and dedupe matter more than raw fetch throughput.
- *Who are the clients?* "Our own apps and a few partner integrations, each with an API key." → rate limit per key.
- *What if a site blocks us or is down?* "Show no card." → a definitive `failed` status is enough.

## Step 2: Estimate (rough is fine)

- 2,000 POST/s, say 95% for already-known URLs → ~1,900/s served from cache/Postgres, ~100/s new URLs.
- New URLs → ~100 fetches/s at ~1 s each → ~100 concurrent fetches. At concurrency 20 per worker, that's 5 worker instances, plus headroom.
- Storage: 100 new URLs/s × 86,400 s ≈ 8.6M rows/day × ~1 KB ≈ 8.6 GB/day. That calls for retention (delete or archive previews not requested in 30 days). Worth noting, not solving today.
- Redis: the hot set (say the top 1M previews × 1 KB) ≈ 1 GB. Comfortable.

Estimates shape decisions: here they say "cache hit rate is the main lever" and "Postgres needs a retention plan".

## Step 3: API

See [api-spec.md](api-spec.md). Choices worth defending:

- **POST to request, GET to read.** Requesting has side effects (it may enqueue), so it's not a GET.
- **URL as the identifier** (query parameter on GET) rather than an opaque id: clients already have the URL and shouldn't need to remember ids. The job id is returned only as a debugging aid.
- **202 + Location** for pending work, **200** when known, **404** on GET for unknown. Every status code tells the client what to do next.

## Step 4: Data

- Postgres table keyed by normalized URL (primary key = natural key here: it *is* the identity).
- Status column with CHECK constraints instead of separate tables for ready/failed.
- Pending isn't stored. The queue is the authority on in-flight work, which avoids a second source of truth that can disagree with it.

## Step 5: High-level components

API instances (stateless) → Redis (cache, limiter, queue) → workers → Postgres. Everything stateful is external, so API and worker instances can be added or killed freely.

## Step 6: Deep dives

**Dedupe.** Discussed in the lesson. The key insight: put the atomicity where the work item is created (deterministic job id), not in a check that precedes it.

**Cache consistency.** Previews are effectively immutable once fetched (until a refresh feature exists), so cache invalidation is trivial: TTL only. A refresh would upsert the row and then overwrite the cache entry (write-through), in that order.

**Rate limiting.** Fixed window per API key is enough for fairness here. If partners complain about bursts being rejected at window edges, move to a token bucket (module 19). The limiter runs *after* authentication so unauthenticated garbage can't consume a real customer's quota, and so limits are per key rather than per IP.

**Failure classification.** The fetcher knows HTTP semantics, so it decides permanent vs transient by throwing `PermanentFetchError`. The worker maps that to BullMQ's `UnrecoverableError`. The service never sees BullMQ types.

## Step 7: Trade-offs and what's next

- Job-id dedupe holds while the job is retained (`removeOnComplete` age). After that, the Postgres row prevents refetching. If rows were ever deleted while a stale job remained, a re-request wouldn't enqueue: the GET would say 404 and the POST would get the old job id. That's acceptable for now; document it.
- Failed previews are permanent until someone deletes the row. A "retry failed previews older than 1 hour" policy is a natural next step.
- Redis is a single dependency for three concerns. If it's down, /previews is down. Splitting cache Redis from queue Redis, and degrading gracefully (skip the cache, fail open on limits), are the next resilience steps.

Write the important ones in your `challenge/DECISIONS.md`.
