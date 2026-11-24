# Hardening walkthrough: a suggested order of work

A checkpoint has no numbered TODOs, which makes it easy to get lost. Here's an order that keeps the tests turning green steadily and avoids rework. It's a suggestion, not the only way.

## Step 0: read and run

- Read `src/` top to bottom (it's small) and list every problem you see before writing code. Compare your list with the README's checklist.
- `make up && make test`. Skim the failures by file: each test file is one concern.

## Step 1: the skeleton that everything else hangs on

Do the cross-cutting plumbing first, because every later feature uses it:

1. `requestId` middleware.
2. An error model: an `HttpError` (status, code, message, details, optional headers) and domain errors (`NoteNotFoundError`, `EmailTakenError`, `InvalidCredentialsError`).
3. A central `errorHandler(logger)` that maps them, handles body-parser errors (`entity.parse.failed`, `entity.too.large`) and turns everything else into a logged generic 500.
4. A `notFound` handler.
5. `helmet()` and `express.json({ limit: "100kb" })`.

Tests that go green: most of `hardening.test.ts` and the JSON/413 cases in `notes.test.ts`.

## Step 2: observability

1. `createLogger` with `redact`.
2. An `observe` middleware: child logger on `res.locals.log`, `"request completed"` on finish, metrics via a per-app prom-client `Registry`.
3. `/healthz`, `/readyz` (with timeouts), `/metrics`.

Doing this early pays off: from now on, every failing test leaves useful log lines.

> Tip: route labels come from `req.route.path`. If you mount a router at `/notes`, `req.route.path` is just `/:id` and `req.baseUrl` may already be reset when `finish` fires after an error. Registering routes with full paths (`router.get("/notes/:id", …)`) avoids the problem.

## Step 3: users and sessions

1. Migration `002_…sql`: `users` table (unique, lower-cased email) and `notes.owner_id`.
2. `lib/password.ts` with scrypt (`node:crypto`), `timingSafeEqual`, and a dummy hash for unknown users.
3. `UserRepository` (use `ON CONFLICT DO NOTHING` for duplicates: no check-then-insert race).
4. `RedisSessionStore` (`<prefix>sess:<id>`, `SET … EX ttl`).
5. `AuthService` (register, login, resolve, logout). No Express imports.
6. Controllers and routes: register, login (sets the cookie), me, logout. A `requireAuth` guard.

## Step 4: ownership and validation on notes

1. Change `NoteRepository` so every method takes `ownerId` and filters by it in SQL.
2. `NoteService` passes the owner through and throws `NoteNotFoundError` for both "missing" and "not yours".
3. zod schemas for the body, the patch (at least one field) and the `:id` param.

## Step 5: login rate limiting

A Redis fixed window (Lua INCR + EXPIRE), middleware keyed by `(email, IP)`, 429 with `Retry-After`. Put it **before** the login controller.

## Step 6: lifecycle, Dockerfile, DECISIONS.md

- Port `lifecycle.ts` from module 26 (pino logs are `(fields, msg)`, not `(msg, fields)`).
- Wire it in `server.ts` with hooks for the pool and Redis.
- Dockerfile + `.dockerignore`.
- Write DECISIONS.md while the trade-offs are fresh.

## Before you call it done

- `npm run typecheck` is clean.
- Search `src/` for `console.`, `process.env` and `req.body` passed straight to a service.
- Run the app (`make migrate && make dev`) and try the curl flow in CHALLENGE.md, including a `kill -TERM`.
