# Challenge · Redis Toolkit

**Type:** 🛠️ Build · **Est:** 2.5–3.5h · **Services:** Redis

## Scenario

> **#platform** · *Marco (staff engineer):* We keep reinventing the same Redis snippets in every service, usually with a race condition hiding in them. Let's build a small, well-tested toolkit: counters, sessions, a leaderboard, unique visitor counts, activity feeds, a lock, once-only coupon claims and an event stream. Each function takes the Redis client as a parameter, so services can pass their own. The tests in `test/` are the contract, and several of them fire concurrent requests on purpose. "Works when I click it once" isn't the bar. 🙂

## Your task

Implement the functions in `challenge/src/exercises/`. Each file starts with a comment that explains the key layout and why that data structure fits. Every function currently throws `Not implemented`.

| # | File | Structure | Functions |
|---|---|---|---|
| 1 | `pageViews.ts` | String | `recordView`, `getViews`, `getViewsMany` |
| 2 | `sessions.ts` | Hash + TTL | `createSession`, `getSession`, `touchSession`, `destroySession` |
| 3 | `leaderboard.ts` | Sorted set | `addScore`, `topN`, `rankOf` |
| 4 | `uniqueVisitors.ts` | HyperLogLog | `trackVisit`, `countUnique`, `countUniqueAcross` |
| 5 | `activityFeed.ts` | List (capped) | `pushActivity`, `recentActivity` |
| 6 | `lock.ts` | String `SET NX PX` + Lua | `acquireLock`, `releaseLock`, `withLock` |
| 7 | `coupons.ts` | Set (+ Lua) | `claimCoupon`, `claimLimitedCoupon`, `claimedCount` |
| 8 | `eventStream.ts` | Stream | `appendEvent`, `readEvents` |

Build every key with the `key()` helper from `src/lib/keys.ts`, so everything lands under `wl:17:`. The exact key names are in each file's header comment, and the tests check them.

Suggested order: 1 → 3 → 2 → 5 → 4 → 8 → 7 → 6. The lock is last because it brings the most ideas together.

## Acceptance criteria

- [ ] **Page views:** `INCR`-based counter. 200 concurrent views count exactly 200. Missing pages read as 0. `getViewsMany` uses one round trip (no loop of `GET`s) and handles `[]`.
- [ ] **Sessions:** stored as a hash at `wl:17:session:<id>` with a TTL set atomically with the data. `getSession` returns `null` for unknown or expired sessions and a numeric `createdAt`. `touchSession` slides the expiry and never creates a key. `destroySession` reports whether it existed.
- [ ] **Leaderboard:** a sorted set. `addScore` returns the new numeric score. `topN` returns `{ player, score, rank }` highest first with 1-based ranks, and handles `n = 0`, oversized `n` and empty boards. `rankOf` is 1-based or `null`.
- [ ] **Unique visitors:** a HyperLogLog per day, estimates within 2% for 3,000 visitors, multi-day counts count a visitor once and don't modify the per-day keys.
- [ ] **Activity feed:** newest first, JSON round-trips, capped at `maxLength` (default 50) by dropping the oldest entries.
- [ ] **Lock:** only one of 20 concurrent acquirers wins. The lock has a millisecond TTL. Releasing with a wrong or stale token never deletes someone else's lock. `withLock` always releases (even when `fn` throws) and throws `LockNotAcquiredError` without running `fn` when the lock is busy.
- [ ] **Coupons:** `claimCoupon` succeeds once per user even under 20 concurrent calls. `claimLimitedCoupon` returns `claimed` / `already_claimed` / `sold_out`, and 50 concurrent users with limit 10 produce exactly 10 claims.
- [ ] **Event stream:** auto ids, entries oldest first with fields as objects, strictly-after-`afterId` reads that support paging, `[]` for missing streams, and bounded length via `MAXLEN`.
- [ ] `npm test` and `npm run typecheck` pass.

## Getting started

```bash
cd 17-redis-fundamentals/challenge
make install
make up          # Redis 7 on localhost:6380
make test        # all red; turn them green one file at a time
npx vitest run test/pageViews.test.ts   # run just one exercise
make redis-cli   # look at what your code wrote: SCAN 0 MATCH wl:17:*
make dev         # runs src/playground.ts, a scratchpad for experiments
```

The tests wipe every `wl:17:*` key before each test, so feel free to poke around in `redis-cli`.

## Rules

- Don't modify the tests.
- Use `ioredis` only: no other Redis helper libraries.
- Every key goes through `key()` (prefix `wl:17:`).
- No read-modify-write from Node where a single command, `MULTI` or a Lua script does the job atomically. Some tests will catch you, and reviewers will catch the rest.
- Never use `KEYS`.

## Stretch goals

1. Add `recordViews(redis, pageIds)` that increments many counters in one round trip with a pipeline, and measure it against a sequential loop of 1,000 `INCR`s.
2. Register the lock-release and coupon scripts with `redis.defineCommand` so they're sent with `EVALSHA`.
3. Add `around(redis, board, player, k)`: the k players above and below someone on the leaderboard.
4. Add a consumer-group reader for the event stream (`XGROUP CREATE`, `XREADGROUP`, `XACK`) and a test showing that two consumers in the same group never receive the same entry.
5. Add a lock `extend(redis, resource, token, ttlMs)` (Lua: extend only if you still own it) for jobs that run longer than expected.

## Done?

1. `npm test` is green and `npm run typecheck` is clean.
2. Commit on your branch `module/17-redis-fundamentals`, push and open a PR. CI runs this module's tests. Ask Claude to review the PR if you want feedback.
3. From the repo root: `npm run progress -- 17` to tick it off on the roadmap.
4. Answer the questions in [INTERVIEW.md](INTERVIEW.md).
5. Add an entry to [LOG.md](../LOG.md).
6. Compare with the reference solution: `git diff main origin/solutions -- 17-redis-fundamentals/` (and read `SOLUTION.md` on that branch).

Stuck? → [HINTS.md](HINTS.md)
