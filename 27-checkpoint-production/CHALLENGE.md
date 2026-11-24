# Challenge · Harden the Notes SaaS

**Type:** 🛠️ Build (checkpoint) · **Est:** 6–8h · **Services:** Postgres, Redis

## Scenario

> **Launch review: notes-api** · *Reviewer: Dana (Staff Engineer)*
>
> Status: ❌ **Not approved for production.**
>
> The API works in the demo, but I found: no authentication (anyone can read anyone's notes), no limits on login, raw error messages and stack traces in responses, `console.log` of request bodies, no metrics or health endpoints, a process that just dies on SIGTERM, and no container image. Please fix all of it and write down your two biggest trade-offs (session mechanism, login throttling) so I can review the reasoning. The acceptance tests in `test/` are the bar.

This is a checkpoint: there are no numbered TODOs. The starter in `challenge/` is a small, working, layered app. **You decide the structure** of the hardening code, as long as you keep the contract below and the architecture rules.

## The contract

### Fixed interfaces (the tests use these)

- `src/app.ts` exports `createApp(deps: AppDeps)` with `AppDeps = { config, pool, redis, logger, isShuttingDown? }`. Keep that shape (you may add optional fields). **Create everything stateful (prom-client registry, limiters, services) inside `createApp`**: the tests create several apps per process.
- `src/config.ts` `loadConfig(env)` is already complete. Use its fields, and don't read `process.env` anywhere else.
- `src/lib/logger.ts` `createLogger(level, destination?)`: the tests capture logs through the destination, so configure redaction here.
- `src/db/migrate.ts` `migrate(pool, dir)`: the tests apply every file in `migrations/` to a fresh schema. Add your own migration files. Don't edit `001_notes.sql`.
- `src/lib/lifecycle.ts`: same contract as module 26.
- Every Redis key you write starts with `config.redisKeyPrefix` (`wl:27:`).

### Endpoints

| Method & path | Auth | Success | Errors |
|---|---|---|---|
| `POST /auth/register` `{ email, password }` | – | 201 `{ data: { id, email } }`, email lower-cased | 400 `VALIDATION_ERROR` (valid email; password 12–200 chars), 409 `EMAIL_TAKEN` (case-insensitive) |
| `POST /auth/login` `{ email, password }` | – | 200 `{ data: { id, email } }` + `Set-Cookie: sid=…; Path=/; HttpOnly; SameSite=Lax` (+ `Secure` if `config.cookieSecure`) | 401 `INVALID_CREDENTIALS` (identical for unknown email and wrong password), 429 `RATE_LIMITED` + `Retry-After` |
| `GET /auth/me` | session | 200 `{ data: { id, email } }` | 401 `UNAUTHENTICATED` |
| `POST /auth/logout` | session | 204, session deleted from Redis | – |
| `GET /notes` | session | 200 `{ data: Note[] }`: **your** notes, oldest first | 401 |
| `POST /notes` `{ title, body? }` | session | 201 `{ data: Note }`, owned by the session user | 400 (title 1–200 chars, body ≤ 10 000 chars, a string) |
| `GET /notes/:id` | session | 200 | 400 (id not a UUID), 404 `NOT_FOUND` (missing **or not yours**) |
| `PATCH /notes/:id` `{ title?, body? }` | session | 200 | 400 (empty patch, invalid fields), 404 |
| `DELETE /notes/:id` | session | 204 | 404 |
| `GET /healthz` | – | 200 `{ status: "ok" }` (no dependency checks) | – |
| `GET /readyz` | – | 200 `{ status: "ready", checks: { postgres: "ok", redis: "ok" } }` | 503 `{ status: "unavailable", checks: {…"fail"} }` within ~1s per check; 503 `{ status: "shutting_down" }` when `isShuttingDown()` |
| `GET /metrics` | – | Prometheus text | – |

### Cross-cutting requirements

- **Sessions**: random id with ≥ 32 characters, stored at `wl:27:sess:<id>` with TTL `config.sessionTtlSeconds`. A new id on every login. Logout deletes the key.
- **Passwords**: salted, slow hash (scrypt from `node:crypto` is fine). Never stored or logged in plain text.
- **Ownership**: a user can only see and change their own notes. `ownerId` in a request body is ignored.
- **Login rate limit**: at most `config.loginRateLimit.max` attempts (default 5) per `windowSeconds` (60) per **(lower-cased email, client IP)**, counting every attempt. Shared through Redis, so it holds across app instances. The next attempt gets 429 `RATE_LIMITED` with `Retry-After` in seconds.
- **Errors**: every error body is `{ error: { code, message, requestId, details? } }`. Malformed JSON → 400 `INVALID_JSON`. Body > 100kb → 413 `PAYLOAD_TOO_LARGE`. Unknown route → 404 `ROUTE_NOT_FOUND`. Anything unexpected → 500 `INTERNAL_ERROR` / `"Something went wrong"`, plus an error-level (50) log line containing `requestId`.
- **Request ids**: `X-Request-Id` on every response. Reuse an incoming one if it matches `^[A-Za-z0-9_-]{1,128}$`.
- **Security headers**: `X-Content-Type-Options: nosniff`, `Content-Security-Policy`, `Strict-Transport-Security`, `X-Frame-Options`, and no `X-Powered-By` (helmet does this).
- **Logs**: one line per request with `msg: "request completed"`, `requestId`, `method`, `url` (path without query), `statusCode`, `durationMs`, at level info. Never log passwords, session ids, cookies or `Authorization` headers.
- **Metrics**: `http_requests_total` (counter) and `http_request_duration_seconds` (histogram), labels `method`, `route` (template like `/notes/:id`), `status_code`. One registry per app.
- **Graceful shutdown**: `createServerLifecycle` / `installSignalHandlers` as in module 26, wired in `server.ts` with hooks closing Postgres and Redis.
- **Ship it**: `Dockerfile` (multi-stage, Node 22, `npm ci` only, prod deps only in the final stage, `dist/` + `migrations/` copied, `NODE_ENV=production`, non-root `USER`, node-based `HEALTHCHECK`, exec-form `CMD ["node", "dist/…js"]` pointing at a real compiled file) and a `.dockerignore` (node_modules, .git, .env).
- **DECISIONS.md**: fill in both decision records (sessions vs tokens, rate-limit design). Every section needs real content (≥ 20 words).
- **Architecture**: `process.env` only in `src/config.ts`. No `express` imports in `services/` or `repositories/`. No `console.*` in `src/`.

## Acceptance criteria

- [ ] Registration: validation with details, 409 on duplicates, salted hashes (`test/auth.test.ts`)
- [ ] Login and sessions: cookie flags, Redis-backed session with TTL, no enumeration, `/auth/me`, rotation, logout (`test/auth.test.ts`)
- [ ] Notes require auth, are owned, 404 for others' notes, mass assignment ignored, validated, JSON/size errors (`test/notes.test.ts`)
- [ ] Safe 500s with request ids and error logs, request ids, 404 JSON, security headers (`test/hardening.test.ts`)
- [ ] Login rate limit: 5 per window, 429 + Retry-After, per email, case-insensitive, shared across instances, prefixed keys (`test/ratelimit.test.ts`)
- [ ] Request logs, redaction, metrics with template routes, per-app registry, health and readiness (`test/observability.test.ts`)
- [ ] Graceful shutdown drains and closes Postgres then Redis; forced drain; SIGTERM → exit 0 (`test/shutdown.test.ts`)
- [ ] Dockerfile and .dockerignore (`test/ship.test.ts`)
- [ ] Architecture rules (`test/architecture.test.ts`) and DECISIONS.md (`test/decisions.test.ts`)
- [ ] `npm test` and `npm run typecheck` pass

## Getting started

```bash
cd 27-checkpoint-production/challenge
make install
make up          # Postgres 5433 + Redis 6380
make test        # 9 test files, one per concern
```

Not sure where to begin? [docs/hardening-walkthrough.md](docs/hardening-walkthrough.md) suggests an order.

Try it by hand once it works:

```bash
make migrate && make dev
curl -si localhost:3000/auth/register -H 'content-type: application/json' -d '{"email":"ada@example.com","password":"correct horse battery"}'
curl -si -c jar.txt localhost:3000/auth/login -H 'content-type: application/json' -d '{"email":"ada@example.com","password":"correct horse battery"}'
curl -si -b jar.txt localhost:3000/notes -H 'content-type: application/json' -d '{"title":"first"}'
curl -s localhost:3000/metrics | grep http_requests_total
kill -TERM <pid>   # watch the shutdown logs
```

## Rules

- Don't modify the tests or `001_notes.sql`.
- No new dependencies. Everything you need is in `package.json` (express, helmet, ioredis, pg, pino, prom-client, zod) or `node:crypto`.
- Keep the layering: HTTP concerns in middleware and controllers, rules in services, SQL and Redis in repositories.

## Stretch goals

1. Sliding session expiration: refresh the TTL on activity, with an absolute maximum lifetime.
2. "Log out everywhere": track a user's session ids in a Redis set and delete them all.
3. A second, looser per-IP login limit to slow down credential stuffing across many accounts.
4. Add a `pino` `traceparent`-aware child logger and propagate it to an outgoing call ([module 24](../24-observability/README.md)).
5. A compose stack (`migrate` + `api` services) and a CI workflow, as in module 26.
6. CSRF tokens for state-changing requests, and a third ADR on why you did or didn't need them with `SameSite=Lax`.

## Done?

1. `npm test` and `npm run typecheck` are green.
2. Commit on your branch `module/27-checkpoint-production`, push and open a PR. CI runs this module's tests. A self-review against [docs/production-readiness-checklist.md](docs/production-readiness-checklist.md) in the PR description is a great habit.
3. From the repo root: `npm run progress -- 27` to tick it off on the roadmap.
4. Answer the questions in [INTERVIEW.md](INTERVIEW.md).
5. Add an entry to [LOG.md](../LOG.md).
6. Compare with the reference solution: `git diff main origin/solutions -- 27-checkpoint-production/` (and read `SOLUTION.md` on that branch).

Stuck? → [HINTS.md](HINTS.md)
