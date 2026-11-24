# Challenge · Ship the Parcels API

**Type:** 🛠️ Build · **Est:** 4–5h · **Services:** Postgres

## Scenario

> **#platform** · *Marcus (SRE):* The parcels API works great on Jonas's laptop and nowhere else 😅. Before we move it to the cluster I need three things: a proper image (small, non-root, no dev junk, health check), a pipeline that blocks broken PRs and builds the image per commit, and a process that **stops cleanly on SIGTERM**. Last deploy we dropped a few hundred requests because it just died mid-flight. Also please give me a compose file I can run to see the whole thing working, migrations included.

The API itself (`src/`) already works and is tested. Your job is everything around it.

## Your task

| TODO | File | What |
|---|---|---|
| 1 | `Dockerfile` | Multi-stage production image |
| 2 | `.dockerignore` | Keep the build context small and secret-free |
| 3 | `docker-compose.yml` | Add `migrate` and `api` services next to `postgres` |
| 4 | `.github/workflows/ci.yml` | CI pipeline: test job with Postgres + docker build job |
| 5 | `src/lib/lifecycle.ts` | `createServerLifecycle()`: start, drain, force after timeout, run hooks |
| 6 | `src/lib/lifecycle.ts` | `installSignalHandlers()`: SIGTERM/SIGINT, exit codes, double signal |

`src/server.ts` already uses TODOs 5 and 6, so `npm run dev` works once they're done.

### TODO 1: Dockerfile

- A named build stage (`FROM node:22-alpine AS build`) that copies `package.json` + `package-lock.json`, runs `npm ci`, **then** copies the sources (`tsconfig*.json`, `src/`) and runs `npm run build` (outputs to `dist/`, see `tsconfig.build.json`).
- A final stage with **production dependencies only**: `npm ci --omit=dev` in the final stage, or `COPY --from=` a stage that ran it.
- Base images pinned to Node 22 (`node:22-alpine`, `node:22-slim`, …). No `npm install` anywhere.
- Final stage: `ENV NODE_ENV=production`, copy `dist/`, `package.json` and `migrations/`, `EXPOSE 3000`, a non-root `USER`, `HEALTHCHECK … CMD ["node", "dist/healthcheck.js"]`, and `CMD ["node", "dist/server.js"]` in exec form.
- No secrets in `ENV`/`ARG`. No TypeScript sources in the final stage.

### TODO 2: .dockerignore

Ignore at least `node_modules`, `dist`, `.git`, and `.env` (or `.env*`). Don't ignore anything the build needs.

### TODO 3: compose

- `migrate`: `build: .`, command `["node", "dist/db/migrateCli.js"]`, waits for `postgres` to be `service_healthy`, doesn't restart forever.
- `api`: `build: .`, publishes `3000:3000`, waits for `postgres` healthy **and** `migrate` `service_completed_successfully`, has a `stop_grace_period` longer than its `SHUTDOWN_TIMEOUT_MS` (default 10000).
- Both use `DATABASE_URL=postgres://postgres:postgres@postgres:5432/wl_26` (service name, container port).

### TODO 4: workflow

As if `challenge/` were the root of its own repo:

- Triggers: `push` to `main` and `pull_request`. Top-level `permissions: contents: read`.
- A job on `ubuntu-latest` with a `postgres:16-alpine` service (`POSTGRES_PASSWORD`, ports `5433:5432`, `--health-cmd` options) whose steps are: `actions/checkout`, `actions/setup-node` (Node 22, `cache: npm`), `npm ci`, `npm run lint`, `npm run typecheck`, `npm test`, in that order.
- A second job that `needs` the test job and builds the image with a tag containing `${{ github.sha }}` (`docker build -t …:${{ github.sha }} .` or `docker/build-push-action` with `tags`).

It doesn't need to actually run on GitHub. The tests check its structure.

### TODO 5: `createServerLifecycle(options)`

Read the interfaces at the top of `src/lib/lifecycle.ts`. Behavior:

- `start()` listens on `port`/`host` (default host `0.0.0.0`) and resolves with the real port. State `idle` → `running`.
- `shutdown(reason)`:
  - sets state to `draining` **synchronously**, and `isShuttingDown()` returns true from then on
  - stops accepting new connections (new connects get `ECONNREFUSED`)
  - closes idle keep-alive connections immediately
  - lets in-flight requests finish. Their responses carry `Connection: close`, and their socket is closed right after
  - after `drainTimeoutMs`, destroys any connection still open (`forced: true`)
  - **then** runs `onShutdown` hooks in order. A hook that throws is recorded in `hookErrors` and the next hook still runs
  - sets state to `stopped` and resolves with `{ forced, durationMs, hookErrors }`
  - is idempotent: a second call returns the **same promise**

### TODO 6: `installSignalHandlers(lifecycle, target, logger?)`

- First `SIGTERM` or `SIGINT`: call `lifecycle.shutdown(signal)`, then `target.exit(0)`, or `exit(1)` if the report is forced, has hook errors, or shutdown rejected.
- A second signal while shutting down: `exit(1)` immediately, without calling shutdown again.

## Acceptance criteria

- [ ] Dockerfile: multi-stage with a named `build` stage; Node 22 bases; manifests + `npm ci` before sources; no `npm install`; prod-only deps in the final stage; `dist/` and `migrations/` copied, no `src/`; `NODE_ENV=production`; `EXPOSE 3000`; non-root `USER` before `CMD`; `HEALTHCHECK` with `dist/healthcheck.js`; exec-form `CMD` running node on a real `dist/` file; no secrets (`test/dockerfile.test.ts`)
- [ ] `.dockerignore` covers node_modules, dist, .git, .env and keeps package files, src, migrations (`test/dockerfile.test.ts`)
- [ ] Compose: postgres unchanged; `migrate` and `api` built from the Dockerfile with the right `depends_on` conditions, DB URL on the compose network, port 3000, `stop_grace_period` > drain timeout (`test/compose.test.ts`)
- [ ] Workflow: triggers, permissions, Postgres service with health check, checkout + Node 22 with npm cache, `npm ci` → lint → typecheck → test, docker job that `needs` tests and tags with the SHA (`test/workflow.test.ts`)
- [ ] Lifecycle: start/state, in-flight requests complete while new connections are refused, pool closed after the drain, `Connection: close` for keep-alive clients, idle sockets don't delay shutdown, forced close after the timeout, hook errors isolated, idempotent shutdown (`test/lifecycle.test.ts`)
- [ ] Signals: exit 0 on clean shutdown, 1 when forced/failed/rejected, immediate exit 1 on a second signal (`test/signals.test.ts`)
- [ ] The API, health and lint tests keep passing (`test/api.test.ts`, `test/lint.test.ts`)
- [ ] `npm test`, `npm run typecheck` and `npm run lint` pass

## Getting started

```bash
cd 26-docker-ci-deploy/challenge
make install
make up          # Postgres on 5433
make test        # watch them fail
```

Once TODOs 5 and 6 are done, try a real graceful shutdown:

```bash
make migrate && make dev
# another terminal:
curl -s localhost:3000/readyz
kill -TERM <pid of node>    # watch the JSON logs: shutdown started → hook done → complete
```

If you have Docker locally, try the real thing (Docker isn't needed for the tests):

```bash
npm install                  # creates package-lock.json, which npm ci needs
make image && docker history wl-26-api:local
make stack                   # postgres → migrate → api
docker compose stop api      # SIGTERM → graceful drain
```

## Rules

- Don't modify the tests or the API code in `src/` (other than `src/lib/lifecycle.ts`).
- No new dependencies. `node:http` and `node:net` are all you need for the lifecycle.
- Don't use `process.exit` in `lifecycle.ts`. Use the injected `target.exit`, so it stays testable.

## Stretch goals

1. Add a `preStopDelayMs` option: on shutdown, fail readiness first, keep serving for that long, then close the listener (the Kubernetes endpoint-propagation trick).
2. Use BuildKit cache mounts (`RUN --mount=type=cache,target=/root/.npm npm ci`) and compare build times.
3. Extend the workflow: push to `ghcr.io` only on `main` with `docker/build-push-action`, using GHA layer caching.
4. Add a `matrix` to run the tests on Node 20 and 22.
5. Switch the runtime stage to `gcr.io/distroless/nodejs22-debian12` and fix whatever breaks (hint: no shell, and the entrypoint is already `node`).

## Done?

1. `npm test`, `npm run typecheck` and `npm run lint` are green.
2. Commit on your branch `module/26-docker-ci-deploy`, push and open a PR. CI runs this module's tests.
3. From the repo root: `npm run progress -- 26` to tick it off on the roadmap.
4. Answer the questions in [INTERVIEW.md](INTERVIEW.md).
5. Add an entry to [LOG.md](../LOG.md).
6. Compare with the reference solution: `git diff main origin/solutions -- 26-docker-ci-deploy/` (and read `SOLUTION.md` on that branch).

Stuck? → [HINTS.md](HINTS.md)
