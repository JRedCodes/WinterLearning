# Challenge · Habit Tracker API

**Type:** 🛠️ Build (from scratch) · **Est:** 6–8h · **Services:** none

## Scenario

> **#product-habits** · *Sam (PM):* We're validating a habit-tracking feature with a small beta group. For now identity comes from the gateway as an `X-User-Id` header, and in-memory storage is fine (Postgres comes later). The mobile team has agreed on the contract below and already wrote acceptance tests against it.
>
> *Priya (tech lead):* You own the backend. No scaffold this time: design the structure yourself. My non-negotiables: layered architecture, zod validation at the edge, domain errors mapped in one place, typed config, request ids, a central error handler, and a repository interface so we can swap in Postgres without touching the services. There's an architecture test to keep us honest. And please get the streaks right: users get **very** upset when a streak resets wrongly.

## What's provided

- `package.json`, `tsconfig.json`, `vitest.config.ts`, `Makefile`
- `src/app.ts`: the one export the tests need, `createApp({ clock })`, as a stub
- `src/config.ts`: `loadConfig(env)` stub; `src/server.ts`: a minimal composition root to finish
- `test/`: acceptance tests (`habits`, `checkins`, `stats`, `http`, `config`) and `architecture.test.ts`

Everything else is yours to design.

## The API contract

### Conventions

- JSON in, JSON out. Success bodies are `{ "data": ... }`.
- **Identity:** every `/habits` request needs `X-User-Id` matching `^[A-Za-z0-9_-]{1,64}$`, otherwise `401 UNAUTHENTICATED`. Authentication is checked **before** body validation. `GET /health` is public.
- **Request ids:** every response has an `X-Request-Id` header. Reuse an incoming one if it matches `^[A-Za-z0-9_-]{1,128}$`, otherwise generate one.
- **Errors:** `{ "error": { "code", "message", "requestId", "details"? } }`. Validation errors include `details: [{ path, message }]` (e.g. `path: "name"`).
- **Ownership:** a habit that belongs to another user behaves exactly like one that doesn't exist (`404 HABIT_NOT_FOUND`).
- **Time:** all dates are calendar days in **UTC**, formatted `YYYY-MM-DD`. "Today" is the UTC date of `clock.now()`. Habit `createdAt` comes from the clock too (ISO string).

### Habits

A habit: `{ "id": string, "name": string, "description": string, "createdAt": string }` (no other fields in responses).

| Method & path | Request | Success | Errors |
|---|---|---|---|
| `POST /habits` | `{ name, description? }` | `201`, `Location: /habits/:id`, `{ data: habit }` | `400 VALIDATION_ERROR`, `409 HABIT_NAME_TAKEN` |
| `GET /habits` | | `200 { data: habit[] }`, caller's habits, oldest first | |
| `GET /habits/:id` | | `200 { data: habit }` | `404 HABIT_NOT_FOUND` |
| `PATCH /habits/:id` | `{ name?, description? }`, at least one | `200 { data: habit }` | `400`, `404`, `409 HABIT_NAME_TAKEN` |
| `DELETE /habits/:id` | | `204`, no body; its check-ins are deleted too | `404` |

Rules: `name` is a string, trimmed, 1–60 characters. `description` is a string of at most 280 characters, default `""`. Names are **unique per user**, compared case-insensitively after trimming (different users can share names; renaming a habit to a different capitalization of its own name is allowed).

### Check-ins

| Method & path | Success | Errors |
|---|---|---|
| `PUT /habits/:id/check-ins/:date` | `201 { data: { date } }` when new, `200` with the same body if it already existed | `400 VALIDATION_ERROR` (not a real `YYYY-MM-DD` date), `404`, `422 FUTURE_DATE` (after today) |
| `DELETE /habits/:id/check-ins/:date` | `204` | `400`, `404 HABIT_NOT_FOUND`, `404 CHECK_IN_NOT_FOUND` |
| `GET /habits/:id/check-ins?from=&to=` | `200 { data: [{ date }] }`, ascending; `from`/`to` optional and inclusive | `400` (invalid date, or `from` after `to`), `404` |

Past dates (back-filling) are allowed. `2026-02-30`, `2027-02-29` and `2026-3-10` are invalid; `2028-02-29` is valid.

### Stats

`GET /habits/:id/stats` → `200 { data: { currentStreak, longestStreak, totalCheckIns, checkInsLast30Days } }`, or `404`.

- **currentStreak:** the number of consecutive checked-in days ending **today**. If today has no check-in yet, count the run ending **yesterday** instead (the day isn't over). Otherwise 0.
- **longestStreak:** the longest run of consecutive checked-in days ever.
- **totalCheckIns:** number of check-ins.
- **checkInsLast30Days:** check-ins from `today − 29` through `today` (30 days including today).

Example, today = `2026-03-10`, check-ins on 03-05, 03-06, 03-07, 03-09: current 1 (yesterday), longest 3, total 4.

### Everything else

| Situation | Response |
|---|---|
| `GET /health` | `200 { "status": "ok" }` |
| unknown route | `404 ROUTE_NOT_FOUND` (JSON) |
| malformed JSON body | `400 INVALID_JSON` |
| anything unexpected | `500 INTERNAL_ERROR`, message `"Something went wrong"`, logged with `console.error`, no internal details in the body |

### Config

`loadConfig(env)` returns `{ port: number, nodeEnv: "development" | "test" | "production" }` from `PORT` (integer 1–65535, default 3000) and `NODE_ENV` (default `development`). Invalid values throw an error whose message names **every** invalid variable.

## Your task

1. Plan first: domain, rules, endpoints, cross-cutting concerns (see the lesson, section 1). Five minutes of drawing saves an hour of refactoring.
2. Implement the API behind `createApp({ clock })` in `src/app.ts`, with a layered structure:
   - `src/routes/` and/or `src/controllers/`: HTTP and validation
   - `src/services/`: business rules
   - `src/repositories/`: a `*Repository` interface and an in-memory class that `implements` it
   - `src/domain/`: entities, domain errors, pure logic (dates, streaks)
   - `src/middleware/`: request ids, authentication, 404, error handler
3. Implement `loadConfig` in `src/config.ts` and finish `src/server.ts` (graceful shutdown on SIGINT/SIGTERM).
4. Make all tests pass, then review your code with [docs/review-checklist.md](docs/review-checklist.md).

## Acceptance criteria

- [ ] `test/habits.test.ts`: create (trim, defaults, clock time, Location), validation with details, case-insensitive uniqueness per user, list (own, oldest first), get, patch (partial, empty → 400, conflicts), delete (204, frees the name), ownership → 404.
- [ ] `test/checkins.test.ts`: create 201 / repeat 200, back-fill, future → 422 using UTC "today", real-date validation (leap years!), list ascending with inclusive range, invalid range → 400, delete 204 / 404 `CHECK_IN_NOT_FOUND`, check-ins removed with their habit.
- [ ] `test/stats.test.ts`: zero state, streak including today, "yesterday keeps the streak alive", reset after a gap, longest streak anywhere, month/year boundaries, 30-day window edges, stats follow the clock.
- [ ] `test/http.test.ts`: `/health`, 401 rules (and before validation), request ids (generate, reuse, ignore invalid, present in errors), JSON 404, `INVALID_JSON`, generic logged 500.
- [ ] `test/config.test.ts`: defaults, parsing, invalid values named, all problems reported together.
- [ ] `test/architecture.test.ts`: layers exist; no `express` in services/repositories/domain; core never imports HTTP code; `process.env` only in `src/config.ts`; repository interface + implementing class; `app.ts` never listens.
- [ ] `npm test` and `npm run typecheck` pass.

## Getting started

```bash
cd 10-checkpoint-backend-core/challenge
make install
make test            # everything red: that's your to-do list
npm run test:watch   # then press "p" and type a file name to focus
```

Try it by hand once it runs (`make dev`):

```bash
curl -i localhost:3000/habits -H 'x-user-id: alice' -H 'content-type: application/json' -d '{"name":"Read 20 pages"}'
curl -i -X PUT localhost:3000/habits/<id>/check-ins/$(date -u +%F) -H 'x-user-id: alice'
curl -s localhost:3000/habits/<id>/stats -H 'x-user-id: alice'
```

## Rules

- Don't modify the tests. Add your own tests in new files if you like (unit tests for streaks are a great idea).
- Keep `createApp({ clock })` as the entry point; you may accept extra **optional** dependencies.
- Only `express` and `zod` as runtime dependencies. No ORM, no date library: plain `Date` in UTC is enough.
- No `any`. Read "now" only from the injected clock.

## Stretch goals

1. Add `GET /habits?include=stats` that embeds each habit's stats without N extra service calls per habit.
2. Support a per-user time zone (an `X-User-Timezone` header with an IANA name) and compute "today" in it. See [docs/dates-and-time.md](docs/dates-and-time.md).
3. Add `weekly` habits with a `targetPerWeek`, and a "weeks in a row meeting the target" streak.
4. Unit-test `computeStats` (or your equivalent) directly with a table of cases.
5. Write a `DECISIONS.md` with two decisions you made (structure, one service vs two, how you modelled dates) using the headings Context / Options considered / Decision / Consequences.

## Done?

1. `npm test` is green and `npm run typecheck` is clean.
2. Commit on your branch `module/10-checkpoint-backend-core`, push and open a PR with a short description of your structure. CI runs this module's tests. Ask Claude to review the PR: a checkpoint is the perfect time for feedback.
3. From the repo root: `npm run progress -- 10` to tick it off on the roadmap. 🎉 That's Phase 1 done.
4. Answer the questions in [INTERVIEW.md](INTERVIEW.md).
5. Add an entry to [LOG.md](../LOG.md): what would you structure differently next time?
6. Compare with the reference solution: `git diff main origin/solutions -- 10-checkpoint-backend-core/` (and read `SOLUTION.md` on that branch). Different is fine; understand *why* it's different.

Stuck? → [HINTS.md](HINTS.md)
