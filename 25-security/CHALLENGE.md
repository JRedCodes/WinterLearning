# Challenge · Fix the file-sharing API before launch

**Type:** 🐛 Debug · **Est:** 4–5h · **Services:** Postgres

## Scenario

> **#launch-shareit** · *Marcus (eng manager):* The external pentest of ShareIt came back. 😬 Eight findings, and launch is in two weeks. Their report is below, and they left their proof-of-concept requests as tests in `test/`. Can you fix everything? Two conditions: every exploit must be blocked **and** every feature must keep working (the tests check both). Also write up how we're handling the URL-import risk in `DECISIONS.md`, because security wants a record of it.

## The pentest report

> **ShareIt API: findings.** Each finding describes the observed behaviour. Locating and fixing the root cause is the development team's responsibility. Severity uses Critical / High / Medium / Low.

| # | Severity | Finding |
|---|---|---|
| 1 | **Critical** | **File search exposes other users' data.** Crafted values in `GET /files?search=` return files belonging to other users, data from other tables (we retrieved user emails), and in one test changed a user's privileges. A search containing an apostrophe returns HTTP 500. |
| 2 | **Critical** | **Download reads arbitrary files.** `GET /files/download?name=` can return files outside the requesting user's storage: other users' files, and files outside the storage directory entirely (we retrieved a `.env`). |
| 3 | **Critical** | **Import-from-URL reaches internal systems.** `POST /files/import` fetches any URL the user supplies, including the cloud metadata endpoint, localhost services and private-network hosts, and stores the response as a file the attacker can download. Encoded IP forms, IPv6, hostnames resolving to private addresses, and public URLs that redirect inward all work. Error pages from remote servers get stored as files. |
| 4 | **High** | **Privilege escalation via profile update.** `PATCH /me` accepts and stores fields the UI never sends. Adding `"isAdmin": true` grants admin access. Other columns (`id`, `settings`, `createdAt`) can also be overwritten. |
| 5 | **High** | **Process-wide object tampering via settings.** `PUT /me/settings` with keys such as `__proto__` modifies properties of *all* objects in the server process (verified with a harmless marker property). Such keys are also persisted. |
| 6 | **Medium** | **Single-request denial of service.** A ~30-character crafted `email` in `PATCH /me` keeps the server at 100% CPU for over a second; each additional character roughly doubles it. All other requests stall meanwhile. Very long emails are also accepted. |
| 7 | **Medium** | **CORS allows any website to read authenticated responses.** The API echoes any `Origin` with `Access-Control-Allow-Credentials: true`, including `null` and look-alike domains. |
| 8 | **Low** | **Missing hardening headers.** No CSP, HSTS, `X-Content-Type-Options`, frame protection or referrer policy; `X-Powered-By: Express` is present. Applies to error responses too. |

There are **8 findings** and each has its own root cause in the code (one finding may need changes in more than one file).

## Your task

1. Fix all eight findings. The tests in `test/` are the pentester's proof-of-concept requests plus regression tests for the features.
2. Fill in `challenge/DECISIONS.md`: how import-from-URL defends against SSRF, the alternatives, and the remaining risk.
3. Bonus (no test): while fixing finding 4 you'll notice a *second* injection hiding in the same code. Explain it in a comment or in your PR description.

## Acceptance criteria

- [ ] **(1)** Search uses bind parameters: tautologies, `UNION`s and stacked queries have no effect; searching for `report's` works. (`test/injection.test.ts`)
- [ ] **(2)** Downloads only ever serve the requesting user's own uploaded files; every traversal attempt returns 400/404 without leaking content; normal downloads still work as attachments. (`test/files.test.ts`)
- [ ] **(3)** Import-from-URL rejects (400 `URL_NOT_ALLOWED`, **before** any fetch) non-http(s) schemes, credentials in the URL, and any host that is or resolves to a loopback/private/link-local/unspecified/unique-local address, in any notation. It does not follow redirects and treats non-2xx responses as `502 UPSTREAM_ERROR`. Public imports still work. (`test/ssrf.test.ts`)
- [ ] **(4)** `PATCH /me` can only change `displayName` and `email`. (`test/users.test.ts`)
- [ ] **(5)** Settings still deep-merge correctly, but `__proto__` / `constructor` / `prototype` keys can't pollute prototypes and are never stored. (`test/users.test.ts`)
- [ ] **(6)** Email validation runs in well under 50 ms on pathological input, rejects addresses over 254 characters, and still accepts normal addresses. (`test/users.test.ts`)
- [ ] **(7)** CORS grants access (with credentials and `Vary: Origin`) only to exact configured origins, for simple requests and preflights. (`test/headers.test.ts`)
- [ ] **(8)** Standard security headers on every response including errors; no `X-Powered-By`. (`test/headers.test.ts`)
- [ ] `DECISIONS.md` has Context / Options considered / Decision / Consequences filled in. (`test/decisions.test.ts`)
- [ ] `npm test` and `npm run typecheck` pass.

## Getting started

```bash
cd 25-security/challenge
make install
make up            # Postgres on 5433 (tests use database wl_25)
make test
```

Poke it manually (optional):

```bash
make seed          # creates demo users and prints their tokens
make dev
curl -s localhost:3000/files -H 'Authorization: Bearer alice-dev-token'
curl -s localhost:3000/files -H 'Authorization: Bearer alice-dev-token' -G --data-urlencode "search=' OR 1=1 --"
```

## Rules

- Don't modify the tests or `test/helpers.ts`.
- Keep functionality: the tests check the features as well as the exploits.
- Fix root causes. Examples of what doesn't count: catching the SQL error and returning `[]`; stripping `../` with a regex; blocking the string `"localhost"`; deleting the settings endpoint.
- Keep the layering: SQL stays in repositories, HTTP concerns in controllers/middleware.
- The only new import allowed is `helmet` (already in `package.json`) plus Node built-ins.
- Use these exploit inputs only against your local copy of this app.

## Stretch goals

1. Create a least-privilege Postgres role for the app (see the lesson, §12), run the tests with it, and confirm a stacked `DROP TABLE` would fail even if injection came back.
2. Make redirects work safely: follow up to 3, re-validating each `Location`.
3. Close the DNS-rebinding gap: validate inside the connection's DNS lookup with an undici `Agent({ connect: { lookup } })`.
4. Escape `%` and `_` in search so `50%` matches literally (the solution does this; add a test).
5. Run `npm audit` and `npx eslint-plugin-regexp`-style linting; write down what you'd add to CI.
6. Log every blocked attack attempt as a structured `warn` with the user id (but not the payload's secrets) and think about what you'd alert on.

## Done?

1. `npm test` is green and `npm run typecheck` is clean.
2. Commit on your branch `module/25-security`, push and open a PR. CI runs this module's tests.
3. From the repo root: `npm run progress -- 25`.
4. Answer the questions in [INTERVIEW.md](INTERVIEW.md).
5. Add an entry to [LOG.md](../LOG.md).
6. Compare with the reference solution: `git diff main origin/solutions -- 25-security/` (and read `SOLUTION.md` on that branch).

Stuck? → [HINTS.md](HINTS.md)
