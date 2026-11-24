# 00 · Dev Environment & Workflow

> Before you write a single endpoint, you need a setup where anyone (you next month, a teammate, CI) can clone the repo, type one command and get the same working system. That repeatability is most of what "it works on my machine" is missing, and it's the first thing a senior engineer checks in a new codebase.

**Time:** ~3h · **Challenge:** 🛠️ Build · **Prereqs:** none, this is the start · **Services:** Postgres + Redis (you write the compose file)

## What you'll learn

- The terminal moves you'll use every day, and how exit codes tie tools together
- Git as a daily tool: commits, branches, merge vs rebase, pull requests, conventional commits
- How this repo works: `module/NN-slug` branches, PRs, CI and `npm run progress`
- Pinning Node with `nvm` and `.nvmrc`
- `package.json`, npm scripts, semver ranges and why lockfiles exist
- Environment variables and `.env` files: config without hard-coding
- Docker from first principles: images, containers, ports, volumes, networks
- Docker Compose and **healthchecks**, so "started" means "ready"
- Makefiles as a project's front door

---

## 1. The terminal, briefly but properly

You'll live in a shell (bash or zsh). The ideas below matter far more than memorizing commands.

### Every command returns an exit code

When a program finishes it hands the shell a number: `0` means success, anything else means failure. You can see it with `echo $?`:

```bash
$ ls /nope
ls: cannot access '/nope': No such file or directory
$ echo $?
2
```

This one convention is what lets tools compose. `&&` runs the next command only if the previous one exited 0, `||` only if it failed:

```bash
npm test && git push          # only push if tests pass
make up || echo "is Docker running?"
```

CI systems, Makefiles, git hooks and Kubernetes probes all decide "did it work?" by exit code. That's why the `checkServices` script you'll write must **exit non-zero when a service is down**. A health check that prints "FAILED" but exits 0 is a lie to every machine that runs it.

### Streams: stdout, stderr, pipes

Programs write normal output to **stdout** and errors/diagnostics to **stderr**. Pipes (`|`) connect one program's stdout to the next one's stdin:

```bash
docker compose logs redis | grep -i warn      # filter logs
npm test 2>&1 | tee test.log                  # merge stderr into stdout, show AND save
lsof -i :5433                                 # who is using port 5433?
```

### Environment variables live in the shell

```bash
export DATABASE_URL=postgres://localhost:5433/wl_00   # for this shell session
DATABASE_URL=postgres://elsewhere npm test             # just for this one command
env | grep DATABASE                                    # what's set?
```

Child processes inherit their parent's environment. That's the whole mechanism behind configuring apps with env vars (section 5).

### Small habits that pay off

| Habit | Why |
|---|---|
| `Ctrl-R` to search history | You'll retype the same 20 commands forever otherwise |
| `which node` / `type make` | "Which binary am I actually running?" solves half of all setup bugs |
| `cd -` | Jump back to the previous directory |
| Read the **first** error, not the last | Later errors are often consequences of the first |
| `man <cmd>` / `<cmd> --help` | Faster than searching the web for flags |

## 2. Git as a daily tool

Git stores your project as a chain of **commits**. Each commit is a snapshot of every file plus a pointer to its parent. A **branch** is just a movable label pointing at one commit. Once you see it that way, most of Git stops being scary.

```mermaid
gitGraph
  commit id: "init"
  commit id: "add README"
  branch module/00-dev-environment
  checkout module/00-dev-environment
  commit id: "feat: compose file"
  commit id: "feat: Makefile"
  checkout main
  commit id: "docs: fix typo"
  checkout module/00-dev-environment
  commit id: "feat: checkServices"
  checkout main
  merge module/00-dev-environment
```

### The three places your changes live

```mermaid
flowchart LR
  W[Working tree<br/>files on disk] -- git add --> S[Staging area<br/>the next commit]
  S -- git commit --> R[Repository<br/>history]
  R -- git push --> O[(origin<br/>GitHub)]
  O -- git pull / fetch --> R
```

`git add -p` lets you stage *parts* of a file. It's the single best habit for clean commits: you review every hunk before it goes in, and you catch the stray `console.log` before your reviewer does.

### What makes a good commit

A commit should be **one logical change** that builds and passes tests on its own. If the message needs the word "and", it's probably two commits. Small commits make `git bisect` (binary-search history for the commit that broke something) and code review dramatically easier.

This repo uses **Conventional Commits**, a lightweight format many teams use so humans and tools can scan history:

```
<type>(<optional scope>): <short summary in imperative mood>

<optional body: WHY you made the change, not what; the diff shows what>
```

| Type | Use it for |
|---|---|
| `feat` | a new capability |
| `fix` | a bug fix |
| `refactor` | restructuring without behavior change |
| `test` | adding or fixing tests only |
| `docs` | documentation only |
| `chore` | tooling, deps, config |

```
feat(00): add docker-compose with postgres and redis healthchecks
fix(01): memoize in-flight rate lookups to avoid duplicate fetches
```

Tools can generate changelogs and decide version bumps from these prefixes (`feat` → minor, `fix` → patch, `!` → major). Even without tools, a history you can skim is worth a lot.

### Merge vs rebase

Both integrate changes from one branch into another. They differ in what history looks like afterward.

- **Merge** (`git merge main`) creates a merge commit with two parents. History is truthful (it shows that work happened in parallel) but can get noisy.
- **Rebase** (`git rebase main`) replays your commits on top of the latest `main`, as if you'd started from there. History is linear, but your commits get **new hashes**: they're technically new commits.

```mermaid
flowchart TB
  subgraph Merge
    direction LR
    m1((A)) --> m2((B)) --> m4((M))
    m1 --> m3((C)) --> m4
  end
  subgraph Rebase
    direction LR
    r1((A)) --> r2((B)) --> r3((C'))
  end
```

The golden rule: **never rebase commits that other people have already based work on** (in practice: don't rebase `main`, and only force-push your *own* feature branch). When you do force-push your own branch after a rebase, use `git push --force-with-lease`. It refuses to overwrite the remote if someone else pushed in the meantime.

Many teams **squash-merge** PRs: the whole branch becomes one commit on `main`. You get messy-but-honest history while working and one clean commit per feature on `main`.

### Pull requests

A pull request (PR) is a proposal: "please merge branch X into main". It's where code review, CI results and discussion happen. A good PR:

- does one thing, and is small enough to review in 15 minutes (aim for a few hundred lines at most),
- has a description: **what** changed, **why**, and **how you tested it**,
- is green in CI before you ask for review.

### How this repo works

Every module follows the same loop:

```mermaid
sequenceDiagram
  participant You
  participant Local as Local repo
  participant GH as GitHub
  participant CI
  You->>Local: git switch -c module/00-dev-environment
  You->>Local: work, commit (conventional commits)
  You->>GH: git push -u origin module/00-dev-environment
  You->>GH: open PR → main
  GH->>CI: run THIS module's tests (with Postgres/Redis if needed)
  CI-->>GH: ✅ / ❌ on the PR
  You->>GH: merge when green
  You->>Local: npm run progress -- 00 (ticks the roadmap)
```

- `main` holds starters (tests fail until you solve them). The `solutions` branch holds reference solutions. Look only **after** you're done: `git diff main origin/solutions -- 00-dev-environment/`.
- `npm run progress -- NN` from the repo root runs that module's tests and marks it done on the roadmap if they pass.
- `LOG.md` at the root is your learning log. One short entry per module (what clicked, what was hard) turns into great interview material later.

The [git cheat sheet](docs/git-cheatsheet.md) has the commands, including how to undo things.

## 3. Pinning Node: nvm and `.nvmrc`

Different projects need different Node versions, and Node changes behavior between majors (new globals, removed APIs, different defaults). **nvm** (Node Version Manager) installs several versions side by side and switches between them per shell.

```bash
nvm install 22        # install the latest Node 22.x
nvm use 22            # use it in this shell
node -v               # v22.x.y
```

A `.nvmrc` file in the project contains just a version (`22`). Running `nvm use` with no argument reads it. CI tools (GitHub Actions' `setup-node`), editors and teammates can all read the same file, so the version is defined **once**, in the repo, instead of in someone's head.

> 💡 Pin the **major** (`22`) for a learning repo or a library. Applications deployed to production often pin an exact version (`22.11.0`) and also lock it in the Docker image, so what you test is exactly what you ship.

Alternatives you'll meet: `fnm` and `volta` (faster nvm-likes), `asdf`/`mise` (one tool for many languages), and the `engines` field in `package.json` (`"engines": { "node": ">=22" }`), which documents and, with `engine-strict`, enforces the range.

## 4. `package.json`, scripts, semver and lockfiles

### The manifest

```json
{
  "name": "wl-00-dev-environment",
  "private": true,
  "type": "module",
  "scripts": {
    "check": "tsx src/cli.ts",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": { "pg": "^8.23.1", "ioredis": "^6.1.0" },
  "devDependencies": { "vitest": "^5.1.1", "typescript": "^7.0.2" }
}
```

- `"private": true` prevents an accidental `npm publish` of your app.
- `"type": "module"` makes `.js` files ES modules (`import`/`export`). Module 02 covers ESM vs CommonJS.
- **dependencies** are needed at runtime. **devDependencies** are only needed to build or test (TypeScript, Vitest). Production images install with `npm ci --omit=dev` and stay smaller.

### npm scripts

`npm run <name>` runs a script with `node_modules/.bin` on the `PATH`, so `vitest` works without a global install. `npm test` and `npm start` are shortcuts. Scripts are the project's command vocabulary: a new teammate reads `scripts` to learn how to run things. You'll see the same names (`dev`, `test`, `typecheck`) in every module of this repo, on purpose.

### Semantic versioning

Versions are `MAJOR.MINOR.PATCH`. The promise: **patch** = bug fixes, **minor** = new features, backwards compatible, **major** = breaking changes.

| Range | Means | Example matches for `8.23.1` |
|---|---|---|
| `8.23.1` | exactly this | 8.23.1 |
| `~8.23.1` | patch updates | 8.23.x |
| `^8.23.1` | minor + patch updates (the npm default) | 8.x.x, ≥ 8.23.1 |
| `^0.29.9` | ⚠️ for 0.x, caret only allows patches | 0.29.x |
| `*` / `latest` | anything | don't |

Semver is a promise made by humans, so it sometimes breaks. That's why lockfiles exist.

### Lockfiles

`package.json` says *which ranges are acceptable*. `package-lock.json` records *exactly which versions were installed*, including every transitive dependency, plus integrity hashes.

```mermaid
flowchart LR
  PJ["package.json<br/>pg: ^8.23.1"] --> NI[npm install]
  NI --> LF["package-lock.json<br/>pg 8.23.1, pg-protocol 1.10.3, ..."]
  LF --> CI["npm ci<br/>(CI, Docker)"]
  CI --> NM[identical node_modules everywhere]
```

- `npm install` resolves ranges, may update the lockfile, and is what you use while developing.
- `npm ci` deletes `node_modules` and installs **exactly** what the lockfile says, failing if it's out of sync with `package.json`. Use it in CI and Dockerfiles.

In a real application repo you **commit the lockfile**. This learning repo is unusual: each module is a tiny standalone project, so lockfiles are gitignored to avoid thousands of lines of churn in your PRs. Don't copy that choice to a production app.

## 5. Environment variables and `.env`

Config that differs between environments (laptop, CI, staging, production) or that's secret should not be hard-coded. The widely used [Twelve-Factor App](https://12factor.net/config) guideline puts it as: store config in the environment.

```ts
// ❌ hard-coded: works only on your laptop, and leaks the password into git history forever
const db = new pg.Client("postgres://admin:hunter2@prod-db:5432/app");

// ✅ read from the environment, with a safe LOCAL default
const url = env.DATABASE_URL || "postgres://postgres:postgres@localhost:5433/wl_00";
```

Rules of thumb that save real incidents:

1. **Read env in one place** (a config module) and pass values down. Code scattered with `process.env.X` is hard to test and hard to audit. In this challenge, `loadConfig(env)` takes the environment as a parameter, so tests pass a plain object. From module 07 on, `config.ts` validates everything with zod at startup.
2. **Validate at startup and fail loudly.** A typo'd timeout should crash the process on boot, not cause weird behavior at 3am.
3. **Defaults only for local-dev-safe values.** Defaulting the DB URL to `localhost` is fine. Defaulting a production API key is not.
4. **Everything in env is a string.** `"false"` is truthy, `"0"` is truthy, `""` is a value. Parse deliberately.

### `.env` files

A `.env` file is a list of `KEY=value` lines loaded into the environment for local development. Node 22 can load one natively (`node --env-file=.env app.js`), and tools like `tsx`, Docker Compose and many frameworks read them too.

- `.env` holds **your** values, possibly secrets. It's **gitignored**.
- `.env.example` documents every variable with safe example values. It's **committed**. A new teammate runs `cp .env.example .env` and is done.

If a secret ever gets committed, deleting it in a later commit doesn't help: it's in history. **Rotate the secret**, then clean history if needed. Tools like `gitleaks` and GitHub secret scanning catch this before or after push.

## 6. Docker from first principles

The problem Docker solves: your app needs Postgres 16 and Redis 7. Installing them on your laptop is slow, version-specific, conflicts with other projects, and differs from what CI and production run. Docker packages software with everything it needs and runs it isolated.

### Images vs containers

| | Image | Container |
|---|---|---|
| What | A read-only template: filesystem layers + metadata (default command, ports, env) | A running (or stopped) **instance** of an image |
| Analogy | A class | An object |
| Created by | `docker build` (Dockerfile) or `docker pull` | `docker run` / `docker compose up` |
| Identity | `name:tag`, e.g. `postgres:16-alpine` | a name/ID, e.g. `wl-00-postgres-1` |
| Lifetime | Until deleted | Writable layer is **discarded** when the container is removed |

Tags matter: `postgres:16-alpine` is "Postgres major 16, built on the small Alpine Linux base". `postgres:latest` changes under you; avoid it for anything you want reproducible.

A container is **not** a virtual machine. It's a normal process on the host kernel, fenced off with Linux namespaces (its own filesystem, network, process list) and cgroups (CPU/memory limits). That's why containers start in milliseconds. On macOS and Windows, Docker Desktop runs a small Linux VM to host them.

### Ports: reaching into the container

Each container has its own network namespace. Postgres listens on port 5432 *inside* the container. To reach it from your laptop you **publish** a port:

```mermaid
flowchart LR
  subgraph Host["Your laptop"]
    APP["npm test<br/>connects to localhost:5433"]
    subgraph C["postgres container"]
      PG["postgres listening on :5432"]
    end
  end
  APP -- "host 5433 → container 5432" --> PG
```

The syntax is always `HOST:CONTAINER`: `"5433:5432"`. This repo uses host ports **5433** (Postgres) and **6380** (Redis) so they never collide with a Postgres or Redis you may have installed locally on the default ports. A collision shows up as `port is already allocated` or, worse, your app silently connecting to the wrong database.

### Volumes: data that survives

A container's own filesystem is thrown away when the container is removed. Databases need their data to outlive containers, so you mount a **volume** at the data directory:

- **Named volume** (`pgdata:/var/lib/postgresql/data`): Docker manages where it lives. Survives `docker compose down`, deleted by `docker compose down -v`. The right choice for database data.
- **Bind mount** (`./src:/app/src`): maps a host folder into the container. Great for live-reloading source code in dev, but bad for database files (permissions, performance on macOS).

### Networks: containers talking to each other

Compose puts all services of a project on one network where each service is reachable **by its service name**. Inside the network, an app container would connect to `postgres:5432` (container port, service name), while your laptop connects to `localhost:5433` (published port). Mixing these up is a classic: `localhost` inside a container means *that container*, not your laptop.

### What happens on `docker run`

```mermaid
sequenceDiagram
  participant You
  participant D as Docker daemon
  participant R as Registry (Docker Hub)
  You->>D: docker run -p 6380:6379 redis:7-alpine
  D->>D: image present locally?
  D->>R: no → pull layers
  R-->>D: layers
  D->>D: create container (namespaces, cgroups, writable layer)
  D->>D: set up network + port forwarding 6380→6379
  D->>D: start the image's default command (redis-server)
  D-->>You: container id
```

## 7. Docker Compose and healthchecks

Typing long `docker run` commands doesn't scale and can't be reviewed. **Compose** describes a set of containers declaratively in `docker-compose.yml`, and that file lives in git next to the code.

```yaml
name: wl-00                      # project name: prefixes containers, networks, volumes

services:
  redis:
    image: redis:7-alpine
    ports:
      - "6380:6379"
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 2s               # how often to run the check
      timeout: 3s                # how long a single check may take
      retries: 20                # failures in a row before "unhealthy"
```

The top-level `version:` key you'll see in older tutorials is obsolete: Compose v2 ignores it and prints a warning. Leave it out.

| Command | Does |
|---|---|
| `docker compose up -d` | create + start everything in the background |
| `docker compose up -d --wait` | same, then **block until healthchecks pass** |
| `docker compose ps` | status, including `(healthy)` |
| `docker compose logs -f redis` | follow one service's logs |
| `docker compose exec postgres psql -U postgres` | run a command inside a running container |
| `docker compose down` | stop + remove containers and network (volumes kept) |
| `docker compose down -v` | ...and delete named volumes (**data gone**) |

### Started ≠ ready

This is the important part. When a Postgres container *starts*, Postgres itself spends a second or more initializing (on first boot, creating the database cluster). If your tests connect during that window, they fail with `ECONNREFUSED` or "the database system is starting up". The failure is intermittent, and that makes it the worst kind.

```mermaid
sequenceDiagram
  participant M as make up
  participant C as Compose
  participant P as postgres container
  M->>C: docker compose up -d --wait
  C->>P: start
  loop every 2s
    C->>P: pg_isready -U postgres
    P-->>C: no response (initializing)
  end
  C->>P: pg_isready -U postgres
  P-->>C: accepting connections ✅ (healthy)
  C-->>M: exit 0
  M->>M: npm test (safe to connect now)
```

A **healthcheck** is a command Docker runs inside the container periodically; exit code 0 means healthy (exit codes again!). `pg_isready` and `redis-cli ping` are purpose-built for this. With `--wait`, `make up` only returns when every service is healthy, so `make up && make test` is reliable. Within Compose, `depends_on: { postgres: { condition: service_healthy } }` gives the same guarantee to a dependent service.

The same idea scales up: Kubernetes has **readiness probes** (don't send me traffic yet) and **liveness probes** (restart me), covered in [module 34](../34-kubernetes-fundamentals/README.md). Your `checkServices` script is a client-side version of it.

## 8. Makefiles: the project's front door

Every project accumulates commands: install, start services, run tests, open a DB shell. A `Makefile` gives them short, discoverable names that are the same across projects. In this repo every module has `make install / up / down / test / reset / dev`, so you never have to remember module-specific incantations.

```make
.PHONY: up down test

up: ## start services and wait until healthy
	docker compose up -d --wait

test: ## run the tests
	npm test
```

What you need to know about `make`:

- A **target** (`up:`) is followed by **recipe** lines, each indented with a **TAB**. Spaces give the cryptic error `missing separator`. Configure your editor to keep tabs in Makefiles.
- `make` was designed to build *files*: a target named `test` is "up to date" if a file called `test` exists, and then it does nothing. **`.PHONY`** declares targets that aren't files, so they always run.
- Each recipe line runs in its **own shell**: `cd foo` on one line doesn't affect the next. Use `cd foo && do-thing` on one line.
- If any line exits non-zero, `make` stops (exit codes, one more time). Prefix a line with `-` to ignore failure, `@` to not echo the command.
- `make` with no arguments runs the first target.

Make isn't the only option: npm scripts, `just`, and Taskfile do similar jobs. Make wins on being preinstalled almost everywhere and language-agnostic, which is why so many infra repos use it.

## 9. Putting it together: the challenge's moving parts

```mermaid
flowchart TB
  subgraph Repo["challenge/"]
    NV[.nvmrc] -.-> NODE[node 22]
    MK[Makefile] -->|make up| DC[docker-compose.yml]
    MK -->|make test| NPM[npm test → vitest]
    MK -->|make dev| CHK[npm run check]
    GI[.gitignore] -.->|keeps out| NM[node_modules / .env / dist]
    ENV[.env.example] -.->|documents| CFG[loadConfig]
  end
  DC --> PG[(postgres:16-alpine<br/>:5433)]
  DC --> RD[(redis:7-alpine<br/>:6380)]
  CHK --> CFG --> RUN[runChecks]
  RUN -->|pg| PG
  RUN -->|ioredis| RD
  RUN --> OUT[report + exit code]
```

`checkServices.ts` is small, but it's designed the way you'll design everything in this repo:

- **Config is read once** (`loadConfig(env)`) and passed in.
- **Logic depends on interfaces, not drivers.** `checkPostgres(client)` accepts anything with `connect/query/end`. The tests pass a fake; production passes a real `pg.Client`. That lets you test failure paths (timeouts, refused connections) in milliseconds, without breaking a real database.
- **I/O lives at the edges.** `main()` returns an exit code instead of calling `process.exit()`, so it's testable, and `cli.ts` is a 2-line adapter to the real process.
- **Timeouts are explicit.** Network calls without timeouts are how one slow dependency freezes a whole system. You'll go much deeper on this in [module 01](../01-js-runtime/README.md) and [module 29](../29-reliability-scaling/README.md).

## Common mistakes

- **Spaces instead of a TAB** in a Makefile recipe (`missing separator`).
- Forgetting `.PHONY`, then wondering why `make test` says "is up to date".
- **Swapping port order**: `"5432:5433"` publishes the wrong thing. It's always `HOST:CONTAINER`.
- `docker compose down -v` when you meant `down`, and wiping your local database.
- Connecting to `localhost` from *inside* a container (use the service name).
- Running tests right after `docker compose up -d` without `--wait`: intermittent `ECONNREFUSED`.
- `.env*` in `.gitignore` without `!.env.example`, so the documentation file never gets committed.
- Committing `node_modules` (huge, platform-specific) or `.env` (secrets).
- `import` of a dev-only package from runtime code, which breaks in production with `--omit=dev`.
- ioredis with default options in a one-shot script: it retries forever and the process never exits.
- A health check that prints "down" but **exits 0**.

## In production

- **Onboarding time is a metric.** Good teams aim for "clone → `make up` → `make test` green" in minutes. Every manual step in a wiki is a step someone will get wrong.
- **Dev/prod parity**: the same Postgres major in compose, CI and production avoids "works locally" bugs (SQL features, default settings). You'll build CI and production images in [module 26](../26-docker-ci-deploy/README.md).
- **CI uses the same services**: GitHub Actions `services:` containers or `docker compose up --wait` before tests, so CI exercises the same code paths as your laptop.
- **Health and readiness checks are everywhere**: load balancers, Kubernetes probes, deploy scripts and status pages all ask "can this thing reach its dependencies?" with an exit code or an HTTP status.
- **Secrets in production** don't live in `.env` files. They come from a secret manager (AWS Secrets Manager, Vault, Kubernetes Secrets) and are injected as env vars or files at runtime.
- **Commit history is documentation**: during an incident, `git log` and `git blame` on the broken line are often the first tools out. Clear, small, conventional commits make that work.

## Check yourself

1. Your PR's CI fails, but the log shows "FAIL" printed and then the job is green. What's wrong?
   <details><summary>Answer</summary>The script printed a failure but exited with code 0. CI only looks at exit codes. The script must exit non-zero on failure (e.g. <code>process.exitCode = 1</code>).</details>
2. What's the difference between `docker compose down` and `docker compose down -v`?
   <details><summary>Answer</summary>Both stop and remove containers and the network. <code>-v</code> also deletes named volumes, which means the database data is gone.</details>
3. When is it safe to rebase, and what flag should you push with afterward?
   <details><summary>Answer</summary>On your own branch that nobody else has built on. Rebasing rewrites commit hashes, so push with <code>git push --force-with-lease</code>, which refuses to overwrite commits you haven't seen.</details>
4. `^8.23.1` vs `^0.29.9`: which versions can each install?
   <details><summary>Answer</summary><code>^8.23.1</code> allows any 8.x.y ≥ 8.23.1. For 0.x versions the caret is stricter: <code>^0.29.9</code> allows only 0.29.x ≥ 0.29.9, because in 0.x a minor bump may be breaking.</details>
5. Why use `--wait` (healthchecks) instead of just `docker compose up -d` before running tests?
   <details><summary>Answer</summary>A started container isn't necessarily ready; Postgres needs time to initialize. <code>--wait</code> blocks until healthchecks pass, so tests don't fail intermittently with connection errors.</details>

## Further reading

- Pro Git book (free, official): https://git-scm.com/book/en/v2
- Conventional Commits: https://www.conventionalcommits.org/en/v1.0.0/
- npm docs, `package.json`: https://docs.npmjs.com/cli/v10/configuring-npm/package-json
- Semantic Versioning: https://semver.org/
- The Twelve-Factor App, Config: https://12factor.net/config
- Docker docs, Compose file reference: https://docs.docker.com/reference/compose-file/
- GNU Make manual: https://www.gnu.org/software/make/manual/make.html
- nvm: https://github.com/nvm-sh/nvm
- Deep dives in this module: [docs/git-cheatsheet.md](docs/git-cheatsheet.md) · [docs/docker-cheatsheet.md](docs/docker-cheatsheet.md) · [docs/git-workflow-in-practice.md](docs/git-workflow-in-practice.md)

## ➡️ Next: [the challenge](CHALLENGE.md)
