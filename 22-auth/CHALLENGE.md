# Challenge · Docs Service Auth

**Type:** 🛠️ Build + find the bugs · **Est:** 5–6h · **Services:** Postgres (`wl_22`), Redis (DB 6, prefix `wl:22:`)

## Scenario

> **#team-docs** · *Marta (staff engineer):* We're replacing the old docs-lite auth with a proper setup: cookie sessions in Redis, roles, and ownership checks on documents. I've wired the app (repos, controllers, routes, error handling) and stubbed the security-critical parts for you. Tests describe exactly what we agreed with security.
>
> Also, bad news: the pentest report for the **legacy** service came back with four findings, and it stays in production for another quarter. Can you patch those too? The PoC exploits are already in `test/legacy.test.ts`.
>
> Last thing: write a short ADR on why we're going with sessions and not JWTs. Someone *will* ask.

## Your task

### Part A: build (in `challenge/src/`)

| TODO | File | What |
|---|---|---|
| 1 | `lib/password.ts` | `hashPassword` / `verifyPassword` with scrypt, per-password salt, self-describing format, constant-time compare |
| 2 | `sessions/sessionStore.ts` | `RedisSessionStore`: create (random 256-bit id), get (sliding TTL), destroy, destroyAllForUser |
| 3 | `lib/sessionCookie.ts` | `Set-Cookie` values with `HttpOnly`, `SameSite=Lax`, `Path=/`, `Max-Age`, optional `Secure`; clearing cookie |
| 4 | `services/authService.ts` | register, login (generic error, dummy-hash timing, session rotation), logout, logout everywhere |
| 5a | `middleware/authenticate.ts` | cookie → session → fresh user from DB → `res.locals.user` |
| 5b | `middleware/authenticate.ts` | `requireRole(...roles)`: 401 vs 403 |
| 6 | `services/documentService.ts` | ownership + admin policy (see the table in the file) |

Everything else (repositories, controllers, routes, error handler, `container.ts`, `app.ts`) is given. Read `app.ts` and `container.ts` first to see how the pieces connect.

### Part B: patch the legacy service (TODO 7, in `challenge/legacy/`)

The pentest found **4 security bugs**. Here's what the testers reported (symptoms only; finding the code is your job):

1. **Token verification is too trusting.** The testers edited a token's header and payload, removed the signature, and `/me` accepted it as any user they liked. They also replayed a token they captured a month ago, and it still worked. A token signed with a different HMAC algorithm than the service issues was also accepted.
2. **Document access.** Logged in as user B, the testers read user A's documents by changing the id in `GET /documents/:id`.
3. **Account discovery.** By looking only at `/login` responses, the testers could tell which email addresses have accounts.
4. **Password storage.** In a copy of the user table, two users with the same password had identical hashes, and most hashes were cracked within minutes with an off-the-shelf wordlist.

Keep the legacy app's API and response shapes unchanged apart from the fixes. You may reuse your Part A code.

### Part C: decision record (TODO 8)

Fill in `challenge/DECISIONS.md`: Context / Options considered / Decision / Consequences, sessions vs JWT for this service. [docs/sessions-vs-jwt.md](docs/sessions-vs-jwt.md) will help.

## Acceptance criteria

**Part A**
- [ ] Passwords are stored as `scrypt$N$r$p$salt$hash`, salted per password, never as plain text or a fast digest; verification uses the stored parameters and returns `false` (never throws) for malformed input. (`password.test.ts`)
- [ ] Sessions live at `wl:22:session:<id>` with a TTL that slides on every read; ids are ≥ 32 random bytes in base64url; per-user set `wl:22:user-sessions:<uid>` supports destroying all sessions. (`sessionStore.test.ts`)
- [ ] The session cookie is `HttpOnly; SameSite=Lax; Path=/; Max-Age=…` and `Secure` when configured; logout clears it with `Max-Age=0`. (`sessionCookie.test.ts`)
- [ ] `POST /auth/register` → 201 public user (role `user`, normalized email, no hash), 409 `EMAIL_TAKEN` for duplicates, 400 for short passwords. (`auth.test.ts`)
- [ ] `POST /auth/login` → 200 + session cookie; unknown email and wrong password both give the identical 401 `INVALID_CREDENTIALS`; the hasher runs even for unknown emails; a new session id is issued on every login and the old one dies. (`auth.test.ts`)
- [ ] `GET /auth/me` → 401 without a valid session; role changes and deleted users take effect immediately. (`auth.test.ts`)
- [ ] `POST /auth/logout` → 204 and session destroyed; `POST /auth/logout-all` ends every session of the user. (`auth.test.ts`)
- [ ] `GET /admin/users` → 401 anonymous, 403 for users, 200 without hashes for admins. (`auth.test.ts`)
- [ ] Documents: owners have full access; other users get 404 on read/update/delete; lists show only your own; `ownerId` can't be set from the body; admins list/read/delete everything but get 403 when editing others' documents. (`documents.test.ts`)

**Part B** (`legacy.test.ts`)
- [ ] Tokens with `alg: none`, a non-HS256 algorithm, a wrong secret, a past `exp` or no `exp` are rejected with 401; expiry uses the injected clock; valid tokens still work.
- [ ] Users can't read other users' documents (404).
- [ ] `/login` returns the same status and body for unknown emails and wrong passwords.
- [ ] Equal passwords produce different, slow, salted hashes; login still works.

**Part C** (`decisions.test.ts`)
- [ ] `DECISIONS.md` has all four sections filled in (≥ 30 words each, no TODO left) and discusses both sessions and JWT.

- [ ] `npm test` and `npm run typecheck` pass.

## Getting started

```bash
cd 22-auth/challenge
make install
make up          # Postgres on 5433, Redis on 6380
make test        # 60 failing tests, a few passing ones
make dev         # optional: run the API on :3000
```

Suggested order: TODO 1 → 3 → 2 → 4 → 5 → 6 → Part B → Part C. Run one file at a time while you work:

```bash
npx vitest run test/password.test.ts
npx vitest test/auth.test.ts          # watch mode
```

Try it by hand with a cookie jar:

```bash
curl -i localhost:3000/auth/register -H 'content-type: application/json' \
  -d '{"email":"ada@example.com","password":"correct horse battery staple"}'
curl -i -c jar.txt localhost:3000/auth/login -H 'content-type: application/json' \
  -d '{"email":"ada@example.com","password":"correct horse battery staple"}'
curl -i -b jar.txt localhost:3000/auth/me
make redis-cli   # then: KEYS wl:22:*   TTL wl:22:session:<id>
```

## Rules

- Don't modify the tests.
- No new dependencies: `node:crypto` has everything you need (no `bcrypt`, `argon2`, `jsonwebtoken`).
- Keep the layering: no Express types in services, no authorization decisions in repositories, no `process.env` outside `config.ts`.
- Never log passwords, hashes, session ids or tokens.

## Stretch goals

1. **Absolute session timeout**: reject sessions older than 30 days even if active (use `createdAt`).
2. **Hash session ids at rest**: store `sha256(id)` as the Redis key, so a Redis dump doesn't contain usable session ids.
3. **Rehash on login**: if a stored hash uses weaker parameters than `SCRYPT_PARAMS`, re-hash and save it after a successful login.
4. **CSRF hardening**: reject state-changing requests whose `Origin` header isn't in an allowlist from config.
5. **Login rate limiting**: 5 failed attempts per email per 15 minutes in Redis, returning 429 with `Retry-After` (preview of [module 19](../19-rate-limiting/README.md)).
6. **Change password** endpoint that requires the current password and calls `logoutEverywhere`, except the current session.

## Done?

1. `npm test` is green and `npm run typecheck` is clean.
2. Commit on your branch `module/22-auth`, push and open a PR. CI runs this module's tests. Ask Claude to review the PR if you want feedback; security code deserves a second pair of eyes.
3. From the repo root: `npm run progress -- 22` to tick it off on the roadmap.
4. Answer the questions in [INTERVIEW.md](INTERVIEW.md).
5. Add an entry to [LOG.md](../LOG.md).
6. Compare with the reference solution: `git diff main origin/solutions -- 22-auth/` (and read `SOLUTION.md` on that branch).

Stuck? → [HINTS.md](HINTS.md)
