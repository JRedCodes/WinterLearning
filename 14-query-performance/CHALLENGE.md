# Challenge · The Slow Feed

**Type:** 🐛 Debug · **Est:** 3–4h · **Services:** Postgres · **Bugs:** 5

## Scenario

> **PERF-412 · Feed API: latency, DB load and a duplicate-posts bug** · Priority: High
>
> Since launch the `feed-api` has gone from "fine" to "embarrassing". Dashboards and user reports from the last week:
>
> 1. **"The feed takes forever."** p95 for `GET /feed` is 10× the other endpoints. The DB team says it's not one slow query: our service sends a *flood* of tiny ones. They counted **41 statements for a single page of 20 posts**, and it grows with `limit`.
> 2. **"Why is the DB → API network link saturated?"** Egress from the primary is far higher than the feed's response sizes justify. The feed only shows a short excerpt of each post.
> 3. **"I saw the same post twice."** Several users report duplicates while scrolling during busy periods. Also, the crawler that walks the feed for our search index is getting slower every week, and the DB team flagged that deep feed pages read thousands of rows to return 100.
> 4. **"Login is sluggish."** Login looks users up by email (case-insensitive). The DB team says the lookup reads the entire `users` table every time.
> 5. **"Profile pages crawl."** `GET /users/:id/posts` (an author's latest posts) also scans the whole `posts` table, and posts is our biggest table.
>
> Fixes must keep the existing API contracts (`test/` encodes them). The mobile team already shipped infinite scroll against `nextCursor`, so the cursor stays an opaque string. Clients just pass it back.

There are **5 bugs**, one per symptom. Some are in code, some are missing from the schema. Your job is to find each root cause with evidence (query counts, `EXPLAIN` plans) and fix it properly.

## Your task

1. Reproduce: run the tests and read the failure messages. They print the offending SQL and the plan.
2. Reproduce by hand too: `make seed`, `LOG_QUERIES=true make dev`, hit the endpoints with curl, and run `EXPLAIN ANALYZE` in `make psql`.
3. Fix each bug:
   - Schema fixes go in a **new** migration file in `migrations/` (e.g. `002_*.sql`). Never edit `001`. It has "already run in production".
   - Code fixes go in `src/` and should keep the layering intact: SQL in repositories, orchestration in services.
4. Re-run until green, then write down (in your PR description or `LOG.md`) each root cause and the evidence that pointed to it.

## Acceptance criteria

- [ ] `GET /feed` returns the newest posts with correct author and comment count, validates `limit` (1–100) and rejects bad cursors with 400 `INVALID_CURSOR` (already passing, keep it that way)
- [ ] `GET /feed` runs **at most 3 queries** per request, whatever the `limit`
- [ ] No query made by `GET /feed` returns the full `body` column
- [ ] Paging with `nextCursor` never repeats or skips posts, even when new posts are published between page loads, and even across posts with identical timestamps
- [ ] Fetching page 31 (limit 100) reads at most 300 rows from `posts`, so deep pages cost the same as the first page
- [ ] `GET /users/lookup?email=` stays case-insensitive and its query plan has **no Seq Scan on `users`**
- [ ] `GET /users/:id/posts` returns the right posts in order and its plan has **no Seq Scan on `posts`**
- [ ] `GET /posts/:id` still returns the full post
- [ ] `npm test` and `npm run typecheck` pass

## Getting started

```bash
cd 14-query-performance/challenge
make install
make up          # Postgres 16 on localhost:5433
make test        # reseeds wl_14 (~5s), then runs the tests
```

Investigate by hand:

```bash
make seed                      # schema + migrations + ~380k rows + ANALYZE
LOG_QUERIES=true make dev      # every SQL statement is printed with its duration
curl -s 'localhost:3000/feed?limit=5' | head -c 600
curl -s 'localhost:3000/users/lookup?email=USER42@example.com'
curl -s 'localhost:3000/users/42/posts?limit=5'
make psql                      # EXPLAIN ANALYZE <paste a query from the log>
```

How the tests work, so you can trust their messages:

- `test/globalSetup.ts` drops the schema, applies **every** file in `migrations/` (yours included), loads `seed/seed.sql` and runs `ANALYZE`.
- The app under test is wired with a `QueryRecorder` (`src/db/queryRecorder.ts`) that records every query a request makes: text, parameters, returned column names.
- Plan assertions run `EXPLAIN (FORMAT JSON)` on **exactly the SQL your code sent**, with its parameters. So the fix has to be real: the right index for the query you actually run.

## Rules

- Don't modify the tests, the seed, or `migrations/001_initial_schema.sql`.
- No caching layer as a fix (caching is [module 18](../18-caching/README.md)); fix the queries and the schema.
- Keep the response shapes the tests expect. `nextCursor` remains an opaque string.
- Don't "fix" a plan by disabling planner options (`SET enable_seqscan = off`) or similar tricks.

## Stretch goals

1. **One query instead of three.** Rewrite the feed as a single query (JOIN users + `LATERAL` count). Compare `EXPLAIN ANALYZE` and the code's readability. Which would you ship, and why?
2. **Denormalized counter.** Add `posts.comment_count` maintained by a trigger (or in the service, in the same transaction as the comment insert). What are the consistency risks?
3. **Covering index.** Can you get an Index Only Scan for the timeline query? What would you have to `INCLUDE`, and is it worth the space?
4. **Search.** Add `GET /posts/search?q=` with case-insensitive substring search over `body`, backed by a `pg_trgm` GIN index. Prove with `EXPLAIN` that it's used.
5. **pg_stat_statements.** If you run your own Postgres via `make up`, enable the extension (`shared_preload_libraries`), run the old and new code under a small load loop, and compare `calls` and `total_exec_time`.

## Done?

1. `npm test` is green and `npm run typecheck` is clean.
2. Commit on your branch `module/14-query-performance`, push and open a PR. In the description, list the 5 root causes with the evidence for each. CI runs this module's tests with a Postgres service.
3. From the repo root: `npm run progress -- 14` to tick it off on the roadmap.
4. Answer the questions in [INTERVIEW.md](INTERVIEW.md).
5. Add an entry to [LOG.md](../LOG.md).
6. Compare with the reference solution: `git diff main origin/solutions -- 14-query-performance/` (and read `SOLUTION.md` on that branch).

Stuck? → [HINTS.md](HINTS.md)
