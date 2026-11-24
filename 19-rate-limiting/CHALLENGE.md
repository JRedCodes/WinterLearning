# Challenge · Distributed Rate Limiter

**Type:** 🛠️ Build · **Est:** 3–4h · **Services:** Redis

## Scenario

> **#incident-review** · *Marcus (SRE):* Recap of Tuesday: someone ran a credential-stuffing list against `/auth/login`, about 40k attempts in 20 minutes, and a partner's broken retry loop took `/api/quotes` to 3,000 req/s at the same time. We do have a rate limiter. It's an in-memory `Map`. We run 6 pods, so it was effectively 6x too generous, and it reset on every deploy.
>
> *Priya (tech lead):* Let's do it properly. The app is already wired: `app.ts` decides which route gets which limiter and policy. What's missing is the limiters themselves (Redis-backed, atomic, three algorithms behind one interface so we can pick per route), the middleware, and the key functions. Tests describe the contract. Login must stay protected even if Redis dies; the quotes API should keep serving.

## Your task

Everything you need to implement is a stub that throws `Not implemented`. The interface, Redis connection, Lua script helper (`src/lib/script.ts`), routes and app wiring are provided. Read `src/limiter/types.ts` first: it defines the contract all limiters share.

| TODO | File | What |
|---|---|---|
| 1 | `src/limiter/fixedWindow.ts` | Fixed window counter (Redis string + Lua) |
| 2 | `src/limiter/slidingWindow.ts` | Sliding window log (sorted set + Lua) |
| 3 | `src/limiter/tokenBucket.ts` | Token bucket (hash + Lua, lazy refill) |
| 4 | `src/middleware/rateLimit.ts` | `rateLimit(limiter, keyFn, options)` middleware: headers, 429, fail-open/closed |
| 5 | `src/middleware/keys.ts` | `apiKeyOrIp` and `loginKey` |

Suggested order: 4 → 5 (no Redis needed, fast feedback with `npx vitest rateLimit keys`), then 1 → 3 → 2.

## Acceptance criteria

**All limiters** (`test/fixedWindow|slidingWindow|tokenBucket.test.ts`)
- [ ] Allow up to the limit/capacity, then reject; `remaining` counts down and never goes negative
- [ ] Report `resetMs` and `retryAfterMs` as defined in `types.ts`
- [ ] Support `cost`; a rejected request uses up no capacity
- [ ] Use the injected `clock` (tests move time by hand)
- [ ] Store keys under the given `prefix`, with a TTL
- [ ] Are atomic: 50 concurrent `consume` calls with limit 10 → exactly 10 allowed

**Algorithm-specific**
- [ ] Fixed window resets at window boundaries
- [ ] Sliding window has no boundary burst and frees capacity exactly when entries slide out; same-timestamp requests count separately
- [ ] Token bucket starts full, refills at the configured rate, keeps fractional tokens between calls, never exceeds capacity

**Middleware** (`test/rateLimit.test.ts`)
- [ ] Passes `keyFn(req)` and `cost` (default 1) to the limiter
- [ ] Sets `RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset` (seconds, rounded up)
- [ ] Rejects with 429 `RATE_LIMITED` and `Retry-After` (seconds, rounded up, at least 1)
- [ ] Limiter error → 503 `RATE_LIMITER_UNAVAILABLE` by default, or passes through with `failOpen: true`; `onLimiterError` called either way

**Keys** (`test/keys.test.ts`)
- [ ] `apiKeyOrIp` counts per API key when present (without exposing the raw key), otherwise per IP
- [ ] `loginKey` combines IP and normalized username

**App** (`test/app.test.ts`, real Redis)
- [ ] `/api` limited per API key; `/health` not limited; login limited even with the right password
- [ ] Two app instances with separate Redis clients share one limit (50 parallel requests → exactly 10 OK)
- [ ] Redis down: `/api` fails open, `/auth/login` fails closed

- [ ] `npm test` and `npm run typecheck` pass

## Getting started

```bash
cd 19-rate-limiting/challenge
make install
make up          # Redis on localhost:6380 (this module uses DB 3, keys wl:19:*)
make test        # 40 failing tests, your to-do list
make dev         # optional: run the API
```

Poke it manually:

```bash
for i in $(seq 1 65); do curl -s -o /dev/null -w "%{http_code} " localhost:3000/api/quotes; done; echo
curl -i localhost:3000/api/quotes -H 'x-api-key: demo'
for i in $(seq 1 7); do curl -s -o /dev/null -w "%{http_code} " localhost:3000/auth/login -H 'content-type: application/json' -d '{"username":"ada","password":"nope"}'; done; echo
make redis-cli   # then: SCAN 0 MATCH wl:19:* · HGETALL <a tb key> · ZRANGE <a sw key> 0 -1 WITHSCORES
```

## Rules

- Don't modify the tests or `src/limiter/types.ts`.
- Each limiter's decision must happen in **one Lua script** (no "GET in Node, then INCR").
- No rate-limiting libraries (`express-rate-limit`, `rate-limiter-flexible`...). Building it is the point.
- Never call `Date.now()` inside a limiter. Use `this.clock()`.
- Middleware must not format error bodies itself: throw `HttpError` and let `errorHandler` do it (module 05).

## Stretch goals

1. Implement a `SlidingWindowCounterLimiter` (two fixed windows, weighted; see [docs/algorithms-deep-dive.md](docs/algorithms-deep-dive.md)) and write tests for it.
2. Add a timeout to the middleware: if `consume` takes longer than 50ms, treat it as a limiter error.
3. Add a `CompositeLimiter` that only allows a request if *all* its limiters allow it (e.g. per IP and per account). Think about what happens to the first limiter's capacity when the second rejects.
4. Read limits per API key from a "plans" map (free: 10/min, pro: 100/min) instead of a constant.
5. Write `DECISIONS.md` in `challenge/` explaining which algorithm you'd put on each route of a real product and why.

## Done?

1. `npm test` is green and `npm run typecheck` is clean.
2. Commit on your branch `module/19-rate-limiting`, push and open a PR. CI runs this module's tests.
3. From the repo root: `npm run progress -- 19` to tick it off on the roadmap.
4. Answer the questions in [INTERVIEW.md](INTERVIEW.md).
5. Add an entry to [LOG.md](../LOG.md).
6. Compare with the reference solution: `git diff main origin/solutions -- 19-rate-limiting/` (and read `SOLUTION.md` on that branch).

Stuck? → [HINTS.md](HINTS.md)
