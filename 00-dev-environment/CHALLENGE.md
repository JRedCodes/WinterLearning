# Challenge · One-Command Local Setup

**Type:** 🛠️ Build · **Est:** 2–3h · **Services:** Postgres 16 + Redis 7 (you write the compose file)

## Scenario

> **#platform** · *Sam (staff engineer):* New hires keep losing their first day to setup. One installed Postgres 14 with Homebrew and spent hours on a migration that only fails on old versions; another's tests flake because they run before the DB is up. Goal: **clone → `make up` → `make test` → green**, same on every laptop and in CI. I put a skeleton in `challenge/`. Can you write the compose file, the Makefile and a `check` script that tells people (and CI) whether Postgres and Redis are actually reachable? Ports 5433/6380 please, half the team already runs Postgres on 5432.

## Your task

Everything lives in `00-dev-environment/challenge/`.

| TODO | File | What |
|---|---|---|
| 1 | `docker-compose.yml` | Postgres 16 + Redis 7, ports 5433/6380, named volume, healthchecks, env |
| 2 | `Makefile` | Add `up`, `down`, `reset`, `logs`, `psql`, `redis-cli`; all targets `.PHONY` |
| 3 | `.gitignore`, `.nvmrc` | Ignore deps/build/secrets/junk (but keep `.env.example`); pin Node 22 |
| 4 | `src/checkServices.ts` | `loadConfig(env)`: env vars with safe defaults and validation |
| 5 | `src/checkServices.ts` | `checkPostgres(client, timeoutMs)` |
| 6 | `src/checkServices.ts` | `checkRedis(client, timeoutMs)` |
| 7 | `src/checkServices.ts` | `realClients`: real `pg` and `ioredis` clients that fail fast |
| 8 | `src/checkServices.ts` | `runChecks()`: both checks in parallel |
| 9 | `src/checkServices.ts` | `formatReport()` and `exitCodeFor()` |

The precise requirements are in the TODO comments. `main()` and `src/cli.ts` are already written: read them to see how your functions fit together.

Suggested order: 3 → 1 → 2 (now `make up` works) → 4–9 (the unit tests use fakes, so they don't need Docker) → run the integration test.

## Acceptance criteria

- [ ] `docker-compose.yml`: project `wl-00`, no `version:` key, `postgres:16-alpine` on `5433:5432` with `POSTGRES_USER/PASSWORD/DB`, a named volume at `/var/lib/postgresql/data`, `redis:7-alpine` on `6380:6379`, healthchecks (`pg_isready`, `redis-cli ping`) with intervals. *(test/compose.test.ts)*
- [ ] `Makefile`: targets `install up down test reset dev logs psql redis-cli`, all `.PHONY`, TAB-indented; `up` waits for health; `down` keeps volumes; `reset` deletes them and reinstalls. *(test/makefile.test.ts)*
- [ ] `.gitignore` ignores `node_modules/`, `dist/`, `.env`, `.env.local`, logs and `.DS_Store`, but **not** `.env.example` or source files. `.nvmrc` pins 22. *(test/hygiene.test.ts)*
- [ ] `loadConfig` reads `DATABASE_URL`, `REDIS_URL`, `CHECK_TIMEOUT_MS` from the env object it's given, with defaults; empty means unset; bad timeouts throw. *(test/checkServices.test.ts)*
- [ ] `checkPostgres` / `checkRedis` never throw, report errors and timeouts as `ok: false`, and always close the client exactly once.
- [ ] `runChecks` runs both checks concurrently and returns `[postgres, redis]`.
- [ ] `formatReport` prints `[ OK ]` / `[FAIL]` lines; `exitCodeFor` is 0 only when all pass.
- [ ] With `make up` running, the integration test passes against real services, and checks against a dead port give up within the timeout. *(test/integration.test.ts)*
- [ ] `npm run check` prints the report and exits 0 when both services are up, 1 when one is down.
- [ ] `npm test` and `npm run typecheck` pass.

## Getting started

```bash
cd 00-dev-environment/challenge
nvm use 22             # or make sure `node -v` says v22
make install
make test              # everything fails: that's the starting line
```

Once TODO 1 and 2 are done:

```bash
make up                # returns only when both services are healthy
docker compose ps      # see "(healthy)"
make dev               # runs npm run check
make test
```

Try the failure path by hand. This is what the exit code is for:

```bash
docker compose stop redis
npm run check; echo "exit code: $?"     # expect a [FAIL] redis line and exit code 1
docker compose start redis
```

> No Docker on your machine? Install Docker Desktop (macOS/Windows) or Docker Engine (Linux) first. If you already run Postgres 16 and Redis 7 natively on 5433/6380 the integration test will use those, but write the compose file anyway; the tests check it.

The database `wl_00` is created automatically by the test setup (`test/globalSetup.ts`), so run `make test` once before `make psql`.

## Rules

- Don't modify the tests.
- No extra dependencies. `pg` and `ioredis` are already in `package.json`.
- `loadConfig` must use the `env` argument, not `process.env` directly (that's what makes it testable).
- Don't call `process.exit()` in `checkServices.ts`. Return exit codes; `cli.ts` sets `process.exitCode`.

## Stretch goals

1. Add a `help` target that prints every target with its `## comment` (hint: `grep` + `awk` over `$(MAKEFILE_LIST)`), and make it the default target.
2. Add `CHECK_ONLY=postgres|redis` support to `loadConfig`/`runChecks`.
3. Make `npm run check` retry for up to N seconds before failing (`--wait` mode), so a CI step can run it right after starting containers.
4. Add a GitHub Actions workflow for this module that starts the services and runs `make test`. Compare it with the repo's real CI.
5. Write your first `LOG.md` entry about what surprised you.

## Done?

1. `npm test` is green and `npm run typecheck` is clean.
2. Commit on your branch `module/00-dev-environment` using conventional commits, push and open a PR. CI runs this module's tests. Ask Claude to review the PR if you want feedback.
3. From the repo root: `npm run progress -- 00` to tick it off on the roadmap.
4. Answer the questions in [INTERVIEW.md](INTERVIEW.md).
5. Add an entry to [LOG.md](../LOG.md).
6. Compare with the reference solution: `git diff main origin/solutions -- 00-dev-environment/` (and read `SOLUTION.md` on that branch).

Stuck? → [HINTS.md](HINTS.md)
