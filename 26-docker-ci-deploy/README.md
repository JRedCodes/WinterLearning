# 26 · Docker, CI & Deployment

> Code that only runs on your laptop isn't done. This module covers the path from `git push` to a running container: a small, safe image, a pipeline that refuses broken code, and a process that shuts down without dropping requests when the platform replaces it.

**Time:** ~6h · **Challenge:** 🛠️ Build · **Prereqs:** [00 · Dev Environment](../00-dev-environment/README.md), [13 · Postgres from Node](../13-node-postgres/README.md), [24 · Observability](../24-observability/README.md) · **Services:** Postgres

## What you'll learn

- How Docker builds images: layers, the build cache, and why instruction order decides your build time
- **Multi-stage builds**: compile with every dev tool, ship without any of them
- Image hygiene: `.dockerignore`, `npm ci`, production-only dependencies, small base images, non-root users
- **PID 1 and signals**: why `CMD ["node", "dist/server.js"]` and `CMD npm start` behave differently on `docker stop`
- `HEALTHCHECK`, compose `depends_on` conditions, and running migrations as a separate step
- **Graceful shutdown**: stop accepting, drain in-flight requests, close the pool, all within a deadline
- **GitHub Actions**: workflows, jobs, steps, service containers, caching, matrices, secrets, permissions
- Deployment strategies (rolling, blue/green, canary), environments, image tagging, and rollback

---

## 1. Why containers?

Before containers, "deploying" meant SSHing into a server that had *some* version of Node installed, running `git pull && npm install`, and hoping the server looked like your laptop. It usually didn't: a different OpenSSL, a missing system library, someone's hotfix from last March that nobody wrote down.

A **container image** packages your app together with its runtime (Node), its dependencies (`node_modules`) and the bits of the OS it needs. The same image runs on your laptop, in CI and in production. If it passed the tests in CI, the exact bytes that passed are what you deploy.

Some vocabulary from [module 00](../00-dev-environment/README.md), now with more precision:

| Term | What it is |
|---|---|
| **Image** | A read-only stack of filesystem layers plus metadata (default command, env, user, exposed ports). Identified by a content digest `sha256:…`. |
| **Tag** | A human-friendly, *movable* pointer to an image: `parcels:1.4.2`, `parcels:latest`, `parcels:3f9c2e1`. |
| **Container** | A running process (plus a writable layer) started from an image, isolated with Linux namespaces and limited with cgroups. |
| **Registry** | A server that stores images: Docker Hub, GitHub Container Registry (ghcr.io), AWS ECR, Google Artifact Registry. |
| **Build context** | The files you send to the builder when you run `docker build .`, filtered by `.dockerignore`. |

> 💡 A container is **not** a small VM. There is no separate kernel and no init system unless you add one. It's your process, started with a restricted view of the machine. That detail matters a lot for signals (section 4).

## 2. Dockerfiles, layers and the build cache

A Dockerfile is a recipe. Most instructions produce a **layer**: a diff of the filesystem.

```dockerfile
FROM node:22-alpine          # base layers (someone else's image)
WORKDIR /app                 # metadata + empty dir
COPY package.json package-lock.json ./   # layer: two files
RUN npm ci                   # layer: node_modules (big!)
COPY . .                     # layer: your source
RUN npm run build            # layer: dist/
CMD ["node", "dist/server.js"]  # metadata only
```

The builder caches every layer. On the next build it walks the instructions top to bottom and **reuses a cached layer as long as the instruction and its inputs haven't changed**. As soon as one layer changes, *every layer after it* is rebuilt.

```mermaid
flowchart TB
  A["FROM node:22-alpine"] --> B["COPY package*.json"]
  B --> C["RUN npm ci  (60s)"]
  C --> D["COPY src"]
  D --> E["RUN npm run build (5s)"]
  style C fill:#d4f7d4
  style D fill:#ffe0b3
  style E fill:#ffe0b3
```

*You edited `src/app.ts`: green layers come from cache, orange ones rebuild. The build takes 5 seconds instead of 65.*

Now look at the naive version:

```dockerfile
COPY . .          # ← any source change invalidates this layer...
RUN npm ci        # ← ...so this 60-second install reruns on every commit
```

**Rule:** copy what changes rarely (the dependency manifests) first, install, and only then copy what changes often (source). That single reordering is the most valuable Dockerfile optimization there is.

### `npm ci`, not `npm install`

| | `npm install` | `npm ci` |
|---|---|---|
| Reads | `package.json`, may update the lockfile | the **lockfile only**, fails if it disagrees with package.json |
| Existing node_modules | patches it | deletes it, installs fresh |
| Result | depends on what the registry has today | exactly what was tested |

Builds must be reproducible, so CI and Dockerfiles use `npm ci`. That requires a committed `package-lock.json`.

> ⚠️ **This repo is special:** WinterLearning gitignores lockfiles so 40 modules don't drown your PRs in lockfile diffs. In a real service, **commit the lockfile**. To build this module's image locally, run `npm install` once (it creates the lockfile on disk) and then `make image`.

### `.dockerignore`

`docker build .` sends the whole directory to the builder before reading a single instruction. Without a `.dockerignore`:

- `node_modules` (hundreds of MB, maybe with native binaries compiled for macOS) gets sent and possibly `COPY`'d over the Linux one.
- `.env` with your real database password ends up in an image layer. Layers are forever: deleting the file in a later layer doesn't remove it from the earlier one, and anyone who can pull the image can extract it.
- `.git` makes every commit bust the `COPY . .` cache.

A good starting `.dockerignore`: `node_modules`, `dist`, `.git`, `.env`, `.env.*`, `coverage`, logs.

## 3. Multi-stage builds

To compile TypeScript you need `typescript`, `@types/*`, maybe a bundler: a few hundred megabytes. To *run* the result you need `node`, production `node_modules` and `dist/`. Multi-stage builds let you use the first set and ship only the second:

```dockerfile
# Stage 1: build with everything
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# Stage 2: runtime with the minimum
FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
USER node
CMD ["node", "dist/server.js"]
```

Only the **last** stage becomes the image. Earlier stages are scratch space you `COPY --from=` out of. Benefits:

- **Smaller images**: faster pulls during deploys and autoscaling, and less disk.
- **Smaller attack surface**: no compiler, no dev dependencies, no source maps or tests you didn't mean to ship.
- **Fewer CVEs** reported by scanners, because there are fewer packages to report on.

A common refinement (used in this module's solution) is a third `deps` stage that runs `npm ci --omit=dev` once. The runtime stage copies its `node_modules`, and the deps and build stages can run in parallel under BuildKit.

### Choosing a base image

| Base | Size (approx) | Notes |
|---|---|---|
| `node:22` | ~1 GB | Full Debian with compilers. Fine for a build stage, too big to ship. |
| `node:22-slim` | ~200 MB | Debian with the extras stripped. glibc, so native modules "just work". |
| `node:22-alpine` | ~150 MB | musl libc. Tiny, but occasional native-module surprises. |
| distroless (`gcr.io/distroless/nodejs22`) | ~130 MB | No shell, no package manager. Hard to exec into, hard to attack. |

**Pin the version.** `node:latest` means your image changes when someone else publishes a release. `node:22-alpine` pins the major. Pinning the digest (`node:22-alpine@sha256:…`) pins the exact bytes, and a bot like Renovate or Dependabot opens a PR when a new one ships.

### Non-root

By default a container runs as **root**. Namespaces help, but a root process that escapes the app (an RCE in a dependency, a path traversal that writes files) has far more power than it should. The official Node images include a `node` user (uid 1000):

```dockerfile
COPY --from=build /app/dist ./dist   # files owned by root, readable by everyone
USER node                            # everything below, and the container, runs as node
```

Leaving the files owned by root is deliberate: the app can read its code but can't modify it. Kubernetes can enforce this with `runAsNonRoot: true` ([module 34](../34-kubernetes-fundamentals/README.md)), and many platforms refuse root containers by policy.

## 4. PID 1, signals and `CMD`

When Docker, Kubernetes or ECS want to stop a container (a deploy, a scale-down, a node being drained) they send **SIGTERM** to PID 1 in the container, wait a grace period (Docker: 10s, Kubernetes: 30s by default), and then send **SIGKILL**, which cannot be caught.

Your app can only shut down gracefully if **it** receives that SIGTERM. Compare:

```dockerfile
CMD npm start                    # shell form
CMD ["npm", "start"]             # exec form, but through npm
CMD ["node", "dist/server.js"]   # exec form, node directly ✅
```

```mermaid
flowchart LR
  subgraph shell["CMD npm start (shell form)"]
    S1["PID 1: /bin/sh -c"] --> S2[npm] --> S3[node]
  end
  subgraph exec["CMD [&quot;node&quot;, &quot;dist/server.js&quot;]"]
    E1["PID 1: node"]
  end
  T[SIGTERM] --> S1
  T2[SIGTERM] --> E1
```

- **Shell form** wraps your command in `/bin/sh -c`. The shell is PID 1, and `sh` doesn't forward SIGTERM to its child. Node never hears it, and 10 seconds later everything gets SIGKILLed mid-request.
- **`npm start`** adds another process in the middle. npm's signal forwarding has varied between versions, and it adds startup time and memory. Don't rely on it.
- **`node` as PID 1** gets the signal directly. One caveat: PID 1 gets no default signal handlers from the kernel, so if your code doesn't handle SIGTERM, *nothing happens* and you get SIGKILLed after the grace period. That's one more reason to install handlers (section 6). Zombie processes are a non-issue for a single Node process; if you spawn children, add `docker run --init` or `tini`.

### HEALTHCHECK

```dockerfile
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=3 \
  CMD ["node", "dist/healthcheck.js"]
```

Docker runs that command inside the container. Exit 0 means healthy, anything else unhealthy. Compose can wait for `service_healthy` and `docker ps` shows the status. Two practical notes:

- Slim, alpine and distroless images often lack `curl`. `node` is always there, so a ten-line `healthcheck.js` that `fetch`es `/healthz` is the portable choice.
- Kubernetes **ignores** Dockerfile `HEALTHCHECK`. It uses its own liveness and readiness probes ([module 34](../34-kubernetes-fundamentals/README.md)). Same idea, configured in the manifest.

## 5. Compose as a prod-like local stack

In module 00 you used compose to run Postgres. Now you'll use it to run **your image** the way production would: built from the Dockerfile, configured only through environment variables, with migrations as a separate step.

```mermaid
sequenceDiagram
  participant C as docker compose up
  participant P as postgres
  participant M as migrate (one-off)
  participant A as api
  C->>P: start
  P-->>C: healthcheck passes (service_healthy)
  C->>M: start: node dist/db/migrateCli.js
  M->>P: CREATE TABLE ...
  M-->>C: exit 0 (service_completed_successfully)
  C->>A: start: node dist/server.js
  A->>P: queries
```

```yaml
services:
  migrate:
    build: .
    command: ["node", "dist/db/migrateCli.js"]
    environment:
      DATABASE_URL: postgres://postgres:postgres@postgres:5432/wl_26
    depends_on:
      postgres: { condition: service_healthy }

  api:
    build: .
    ports: ["3000:3000"]
    environment:
      DATABASE_URL: postgres://postgres:postgres@postgres:5432/wl_26
    depends_on:
      postgres: { condition: service_healthy }
      migrate: { condition: service_completed_successfully }
    stop_grace_period: 15s
```

Things people get wrong:

- **`localhost` inside a container is the container itself.** Services on the compose network reach each other by **service name** (`postgres`) on the **container port** (5432). `5433` is only the port published on *your machine*.
- **Plain `depends_on: [postgres]` only waits for the container to *start***, not for Postgres to accept connections. Use `condition: service_healthy` with a healthcheck.
- **`stop_grace_period`** is how long `docker compose stop` waits between SIGTERM and SIGKILL. If your app drains for up to 10s, give it more than that.

### Why migrations are a separate step

It's tempting to run migrations when the app boots. With one instance that works. With ten instances doing a rolling deploy, ten processes race to alter the same tables, a slow migration delays every pod's readiness, and a failed migration crash-loops your whole fleet.

Treat migrations as a **deploy step**: a one-off container (compose service, Kubernetes Job, a CI step before rollout) that runs once, exits 0 or fails the deploy. The migration runner in this module also takes a Postgres **advisory lock**, so two runners racing is harmless. Combined with expand/contract migrations ([module 12](../12-data-modeling/README.md)), old and new app versions can both run against the schema during the rollout.

### 12-factor, briefly

The [Twelve-Factor App](https://12factor.net/) principles that matter most for containers:

- **Config in the environment**: the same image goes to staging and production, and only env vars differ. No `config.production.json` baked in. `src/config.ts` is the one place that reads them.
- **Logs are event streams**: write JSON lines to stdout and let the platform collect them. Never write log files inside a container.
- **Disposability**: start fast, shut down gracefully. Containers are cattle: they get killed and replaced all the time.
- **Build, release, run are separate**: build the image once, combine it with config to make a release, run it. Never build on the production server.

## 6. Graceful shutdown

Deploys, autoscaling and node maintenance all mean **your process gets killed routinely**, many times a day at scale. If it dies abruptly, every in-flight request fails: a user's checkout returns a 502, a half-done job is retried, a connection pool leaves sessions hanging on the database.

A graceful shutdown on SIGTERM:

```mermaid
sequenceDiagram
  participant K as Orchestrator
  participant A as App
  participant LB as Load balancer
  participant DB as Postgres pool
  K->>A: SIGTERM
  A->>A: state = draining, /readyz → 503
  A->>A: server.close(): stop accepting connections
  A->>A: close idle keep-alive sockets
  Note over A: in-flight requests keep running
  LB-->>A: (readiness fails, removed from rotation)
  A->>A: last response done (or drain timeout → destroy sockets)
  A->>DB: pool.end()
  A->>K: process exits 0
  Note over K: SIGKILL only if grace period expires first
```

The steps, and why each exists:

1. **Flip to draining and fail readiness.** The load balancer or Kubernetes stops sending *new* traffic once `/readyz` fails. Liveness (`/healthz`) keeps passing: you're not broken, you're leaving.
2. **Stop accepting connections.** `server.close()` closes the listening socket. New connection attempts get `ECONNREFUSED`, so the client or load balancer retries elsewhere.
3. **Deal with keep-alive.** `server.close()` waits for **all** connections to end, and HTTP keep-alive connections can sit idle for seconds or minutes. Close idle ones immediately. For busy ones, send `Connection: close` on the current response so the client won't reuse the socket, then end it once that response is done.
4. **Wait, with a deadline.** In-flight requests finish normally. A request that hangs must not hold the shutdown hostage, so after `drainTimeoutMs` you destroy whatever is left. The deadline must be shorter than the platform's grace period, or SIGKILL wins.
5. **Close resources, in order.** Only after HTTP is done do you close the DB pool, Redis, and so on. Closing the pool first would fail the very requests you're trying to finish. A failing hook shouldn't stop the others from running.
6. **Exit.** Exit 0 if everything went well, non-zero if you had to force anything, so it shows up in your metrics.

In code, the core is just a few lines. The challenge asks you to make them robust:

```ts
process.on("SIGTERM", async () => {
  draining = true;                       // /readyz starts returning 503
  server.close();                        // no new connections
  server.closeIdleConnections();         // drop idle keep-alive sockets
  const timer = setTimeout(() => server.closeAllConnections(), 10_000);
  await once(server, "close");           // all connections gone
  clearTimeout(timer);
  await pool.end();
  process.exit(0);
});
```

Two subtleties:

- **The double signal.** Developers press Ctrl+C twice when the first one "doesn't work". The second signal should exit immediately with a non-zero code.
- **Kubernetes endpoint propagation is not instant.** After SIGTERM, some proxies still route to the pod for a second or two. Many teams add a short `preStop` sleep, or keep serving normally for a moment before closing the listener. [Module 35](../35-kubernetes-in-practice/README.md) covers this.

The deeper version, including how Node's `server.close()` behaves with keep-alive, is in [docs/graceful-shutdown.md](docs/graceful-shutdown.md).

## 7. CI with GitHub Actions

**Continuous integration** means every push is built and tested automatically, and a red build blocks the merge. It's the safety net that lets a team merge many times a day.

GitHub Actions concepts:

| Concept | Meaning |
|---|---|
| **Workflow** | A YAML file in `.github/workflows/`. Triggered by events (`on:`). |
| **Event** | `push`, `pull_request`, `workflow_dispatch` (manual), `schedule` (cron), `release`, … |
| **Job** | A set of steps on one fresh runner VM. Jobs run **in parallel** unless linked with `needs:`. |
| **Step** | Either `uses:` an action (reusable code, e.g. `actions/checkout@v4`) or `run:`s a shell command. Steps in a job share a filesystem. |
| **Service container** | A Docker container (Postgres, Redis) started next to the job and reachable on `localhost:<mapped port>`. |
| **Matrix** | Run the same job for several values, e.g. Node 20/22 or a list of modules. |
| **Secrets / vars** | Encrypted values (`${{ secrets.REGISTRY_TOKEN }}`), masked in logs, not available to PRs from forks. |

A complete pipeline for a service like this one:

```yaml
name: ci
on:
  push: { branches: [main] }
  pull_request:

permissions:
  contents: read            # least privilege for the automatic GITHUB_TOKEN

jobs:
  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16-alpine
        env: { POSTGRES_PASSWORD: postgres }
        ports: ["5433:5432"]
        options: >-
          --health-cmd "pg_isready -U postgres" --health-interval 2s --health-retries 30
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm }
      - run: npm ci
      - run: npm run lint
      - run: npm run typecheck
      - run: npm test

  docker:
    needs: test               # only if tests passed
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: docker build -t parcels:${{ github.sha }} .
```

Design points worth being able to explain in an interview:

- **Fast feedback first.** Lint and typecheck take seconds and catch a lot. Run them before the slower tests (or as parallel jobs).
- **Caching.** `cache: npm` caches `~/.npm` keyed on the lockfile hash, so `npm ci` stops downloading the internet on every run. Docker layer caching in CI (`cache-from: type=gha` with buildx) does the same for images.
- **Service containers with health checks.** Without `--health-cmd`, your tests start before Postgres accepts connections and fail at random.
- **Least privilege.** The default token can often write to the repo. `permissions: contents: read` limits the blast radius of a compromised action. Pin third-party actions to a version, or for real paranoia a commit SHA.
- **Build once, promote.** The image tested in CI is tagged with the commit SHA and pushed. Staging and production deploy *that* tag. You never rebuild for production.

This repo's own `.github/workflows/ci.yml` is a real example: it detects which modules a PR touched and runs a matrix job per module with Postgres and Redis service containers.

## 8. Deployment: tags, strategies, rollback

### Tagging images

- **`:latest`** is a moving target. It's fine for local experiments and wrong for deploys, because you can't tell what's running or roll back to "the previous latest".
- **`:<git-sha>`** (e.g. `:3f9c2e1`) is immutable and traceable: every running container maps to an exact commit. This is the tag you deploy.
- **`:1.4.2`** (semver) for releases people consume, e.g. libraries and public images.
- The **digest** (`@sha256:…`) is the truly immutable identity. Kubernetes and ECS can resolve a tag to a digest at deploy time.

### Strategies

```mermaid
flowchart LR
  subgraph Rolling
    R1[v1 v1 v1] --> R2[v2 v1 v1] --> R3[v2 v2 v1] --> R4[v2 v2 v2]
  end
  subgraph BlueGreen["Blue/green"]
    B1["blue v1 ← 100%"] -.switch.-> B2["green v2 ← 100%"]
  end
  subgraph Canary
    C1["v1 95% / v2 5%"] --> C2["v1 50% / v2 50%"] --> C3["v2 100%"]
  end
```

| Strategy | How | Pros | Cons |
|---|---|---|---|
| **Recreate** | stop all v1, start v2 | simple | downtime |
| **Rolling** | replace instances a few at a time | no downtime, no extra capacity; the Kubernetes default | v1 and v2 serve traffic **at the same time**; rollback is another rollout |
| **Blue/green** | run full v2 next to v1, switch the router | instant switch and instant rollback | double capacity during the switch; the DB is shared, so schema changes still need care |
| **Canary** | send a small % of traffic to v2, watch metrics, widen | limits the blast radius of a bad release | needs good metrics and traffic splitting; slower |

All of them, except recreate, have both versions running at once. That's why **backward-compatible changes** matter: expand/contract migrations, tolerant API readers ([module 23](../23-api-design/README.md)), and graceful shutdown so the old version leaves cleanly.

### Environments and rollback

A typical flow: PR → CI → merge to main → image `:sha` pushed → auto-deploy to **staging** → smoke tests → manual approval (GitHub "environments" can require reviewers) → **production**.

**Rollback** means redeploying the previous known-good tag. That only works if you tag immutably, keep old images in the registry, and kept the schema compatible. "Roll forward" (ship a fix quickly) is often preferred when a rollback would be risky, for example after a contract migration has already dropped a column.

## Common mistakes

- `COPY . .` before `npm ci`: every code change reinstalls all dependencies.
- No `.dockerignore`: secrets and host `node_modules` end up in the image.
- `npm install` in Dockerfiles or CI: the build isn't reproducible.
- Shipping dev dependencies and TypeScript sources in the final image.
- Running as root because "it's in a container".
- `CMD npm start` or shell-form `CMD`: SIGTERM never reaches node, every deploy kills requests.
- No SIGTERM handler at all: PID 1 ignores it and gets SIGKILLed after the grace period.
- Closing the DB pool before the HTTP server finished draining.
- A drain timeout longer than the platform's grace period.
- `localhost` in a container's `DATABASE_URL`.
- `depends_on` without `condition: service_healthy`.
- Running migrations on every app boot in a multi-instance deployment.
- Deploying `:latest`, then not knowing what's running or how to roll back.
- Secrets in `ENV` or `ARG` instructions (they're visible in `docker history`).

## In production

- **Image scanning** (Trivy, Grype, Docker Scout, the registry's built-in scanner) runs in CI and fails builds on critical CVEs. Smaller images mean fewer findings.
- **SBOMs and signing** (Syft, cosign, SLSA provenance) let you prove what's in an image and that your CI built it. These are increasingly required in regulated industries.
- **BuildKit cache mounts** (`RUN --mount=type=cache,target=/root/.npm npm ci`) and remote layer caches cut build times further.
- **Platforms**: the same image runs on Kubernetes, ECS/Fargate, Cloud Run, Fly.io or Render. The platform handles SIGTERM, health checks and rolling deploys, and your graceful shutdown code makes those deploys invisible to users.
- **Deploy frequency** is a core DORA metric. Teams that deploy many times a day do it because the pipeline is boring: reproducible builds, a fast CI, immutable tags, one-click rollback.

## Check yourself

1. You changed one line in `src/`. Why might `docker build` still take a minute, and how do you fix it?
   <details><summary>Answer</summary>A <code>COPY . .</code> before <code>RUN npm ci</code> invalidates the install layer on any change. Copy <code>package.json</code> and <code>package-lock.json</code> first, run <code>npm ci</code>, then copy the source.</details>
2. What's the difference between `CMD npm start` and `CMD ["node", "dist/server.js"]` when the container is stopped?
   <details><summary>Answer</summary>Shell form makes <code>/bin/sh</code> PID 1, and it doesn't forward SIGTERM, so node never gets it and is SIGKILLed after the grace period. Exec form with node makes node PID 1, so its SIGTERM handler runs.</details>
3. Why does the drain need a timeout, and how should it relate to the platform's grace period?
   <details><summary>Answer</summary>A hung request would block shutdown forever. The drain timeout plus cleanup must finish before the grace period ends, or the process gets SIGKILLed anyway.</details>
4. Why fail `/readyz` but keep `/healthz` passing during shutdown?
   <details><summary>Answer</summary>Readiness controls traffic: failing it removes the instance from the load balancer. Liveness controls restarts: failing it during a normal drain would make the orchestrator kill the process early.</details>
5. Why tag images with the git SHA rather than `latest`?
   <details><summary>Answer</summary>A SHA tag is immutable and traceable to a commit, so you know what's running, you deploy exactly what CI tested, and rollback means redeploying the previous SHA.</details>

## Further reading

- Dockerfile reference: https://docs.docker.com/reference/dockerfile/
- Docker build best practices: https://docs.docker.com/build/building/best-practices/
- Multi-stage builds: https://docs.docker.com/build/building/multi-stage/
- Compose file reference (services, depends_on): https://docs.docker.com/reference/compose-file/services/
- GitHub Actions documentation: https://docs.github.com/en/actions
- Node.js `http.Server.close()` and `closeIdleConnections()`: https://nodejs.org/api/http.html#serverclosecallback
- The Twelve-Factor App: https://12factor.net/
- Deep dives in this module: [docs/dockerfile-deep-dive.md](docs/dockerfile-deep-dive.md) · [docs/graceful-shutdown.md](docs/graceful-shutdown.md) · [docs/deployment-strategies.md](docs/deployment-strategies.md) · [docs/ci-docker-cheatsheet.md](docs/ci-docker-cheatsheet.md) · root [docker cheat sheet](../docs/cheatsheets/docker.md)

## ➡️ Next: [the challenge](CHALLENGE.md)
