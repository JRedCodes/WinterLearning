# Challenge · Ship kudos-api to Kubernetes

**Type:** 🛠️ Build · **Est:** 4–5h (plus however long you enjoy poking your cluster) · **Services:** none for `npm test`; Docker + kind + kubectl for the runbook

## Scenario

> **#platform** · *Dani (platform engineer):* Hey! The kudos API is moving off the old VM and onto Kubernetes. The app's ready: it has `/healthz` and `/readyz`, reads all config from env, ships migrations as a CLI in the same image, and drains on SIGTERM. What's missing is everything around it. Could you write the manifests in `k8s/` and a runbook so anyone can bring it up on kind? Requirements from the platform side: 3 replicas, zero-downtime rollouts, probes, resource requests and limits, non-root, and no passwords in plain env values. Postgres can run in-cluster for local dev, but I'd like a short ADR on what we'd do in prod. 🙏

## Your task

Everything goes in `challenge/`. The app (`src/`), `Dockerfile` and migrations are provided and already work; read `src/config.ts`, `src/routes/health.ts` and `src/server.ts` before you start. Each `k8s/*.yaml` file contains a TODO comment describing what goes in it.

| TODO | File | What |
|---|---|---|
| 1 | `k8s/00-namespace.yaml` | Namespace `kudos`. Every other object sets `metadata.namespace: kudos`. |
| 2 | `k8s/10-config.yaml` | ConfigMap `kudos-config` (non-secret env vars, keys = names `src/config.ts` reads) and Secret `kudos-db` with `DB_PASSWORD` |
| 3 | `k8s/40-api.yaml` | Deployment `kudos-api`: 3 replicas, rolling update with `maxUnavailable: 0`, image `wl-kudos-api:1.0.0`, probes, resources, env, securityContext |
| 4 | `k8s/40-api.yaml` | Service `kudos-api`: ClusterIP, port 80 → container port `http` |
| 5 | `k8s/20-postgres.yaml` | Headless Service `postgres` + StatefulSet `postgres` (postgres:16-alpine, PVC, `pg_isready` probe), wired to the same ConfigMap/Secret |
| 6 | `k8s/30-migrate-job.yaml` | Job `kudos-migrate`: same image, `node dist/db/migrateCli.js`, same DB env, bounded retries |
| 7 | `RUNBOOK.md` | Copy-pasteable kind steps: create cluster, build + load image, apply, wait, verify, rolling update, rollback, clean up, troubleshooting |
| 8 | `DECISIONS.md` | ADR: Postgres in-cluster vs managed vs operator, for local and for production |

### The app's contract (what your manifests must match)

| Thing | Value | Source |
|---|---|---|
| Listen port | `PORT` env, default `3000` | `src/config.ts` |
| Liveness endpoint | `GET /healthz` (never checks the DB) | `src/routes/health.ts` |
| Readiness endpoint | `GET /readyz` (503 if DB down or draining) | `src/routes/health.ts` |
| DB settings | `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` | `src/config.ts` (defaults point at localhost, which is wrong in the cluster) |
| Shutdown | readiness 503 for `SHUTDOWN_DELAY_MS` (5s), then drain up to `SHUTDOWN_TIMEOUT_MS` (10s) | `src/server.ts` |
| Migrations | `node dist/db/migrateCli.js`, exit code 0/1 | `src/db/migrateCli.ts` |
| Image user | `USER node` (uid 1000, but a *name* in the Dockerfile) | `Dockerfile` |

## Acceptance criteria

**Structure (`test/basics.test.ts`)**
- [ ] `k8s/` holds at least 8 objects; each has `apiVersion`, `kind`, `metadata.name`, and the right apiVersion for its kind.
- [ ] Exactly one Namespace, defined in the alphabetically first file. Every other object is in it.

**Config (`test/config.test.ts`)**
- [ ] ConfigMap `kudos-config` has `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`; every key is read by the app; every value is a string; no secret-looking keys.
- [ ] Secret `kudos-db` is Opaque with `DB_PASSWORD` (`stringData`, or valid base64 under `data`).

**API Deployment (`test/api-deployment.test.ts`)**
- [ ] 3 replicas; selector matches template labels; RollingUpdate with `maxUnavailable: 0` and `maxSurge` ≥ 1.
- [ ] Image `wl-kudos-api:<tag>` (not `latest`) with `imagePullPolicy` `IfNotPresent` or `Never`.
- [ ] Container port named `http` equal to the app's `PORT`; readiness `GET /readyz` and liveness `GET /healthz` on that port.
- [ ] CPU and memory requests and limits, requests ≤ limits, memory limit ≥ 128Mi, CPU request ≤ 1 core.
- [ ] `runAsNonRoot: true` with a numeric non-zero `runAsUser`; `allowPrivilegeEscalation: false`; `readOnlyRootFilesystem: true`; capabilities drop `ALL`.
- [ ] All five `DB_*` vars resolve to existing ConfigMap/Secret keys; `DB_PASSWORD` comes from the Secret; no literal secrets; no env var the app doesn't read.

**API Service (`test/api-service.test.ts`)**
- [ ] ClusterIP Service `kudos-api` selecting the API pods and nothing else, port 80 → the `http` container port.
- [ ] Every httpGet probe path returns 200 from the real app.

**Postgres (`test/postgres.test.ts`)**
- [ ] One `postgres:16-alpine` replica with a PVC mounted at `/var/lib/postgresql/data`, `PGDATA` in a subdirectory, a `pg_isready` readiness probe and resources.
- [ ] Service `postgres` on 5432 selecting it (headless, and the StatefulSet's `serviceName`, if you use a StatefulSet).
- [ ] `POSTGRES_PASSWORD` uses the same Secret key as the API's `DB_PASSWORD`; `POSTGRES_USER`/`POSTGRES_DB` equal the API's `DB_USER`/`DB_NAME`; `DB_HOST` is the postgres Service's DNS name and `DB_PORT` is `"5432"`.

**Migration Job (`test/migrate-job.test.ts`)**
- [ ] Same image as the API; runs `node dist/<path>.js` that maps to an existing `src/**/migrate*.ts`.
- [ ] `restartPolicy` Never/OnFailure, `backoffLimit` 1–10, same DB env as the API, non-root.

**Runbook and ADR (`test/runbook.test.ts`)**
- [ ] `RUNBOOK.md` keeps its headings, has no `TODO`s, and its code blocks include: `kind create cluster`, `docker build -t <the Deployment's image>`, `kind load docker-image <that image>`, `kubectl apply -f k8s/`, waits (`rollout status` / `wait`) including on `job/kudos-migrate`, `port-forward` to `svc/kudos-api` + `curl`, `kubectl set image deployment/kudos-api ...`, `rollout history`, `rollout undo`, `kind delete cluster`.
- [ ] `DECISIONS.md`: Context, Options considered, Decision and Consequences each have at least 20 words.

Then actually **run your runbook** on your machine. The tests check consistency; only a real cluster proves it works.

## Getting started

```bash
cd 34-kubernetes-fundamentals/challenge
make install
make test          # 13 app tests pass already, everything about k8s/ fails
```

Work file by file in the TODO order. `npm run test:watch` reruns on save, and each test's failure message tells you what's missing.

For the cluster part you need [Docker](https://docs.docker.com/get-docker/), [kind](https://kind.sigs.k8s.io/docs/user/quick-start/#installation) and [kubectl](https://kubernetes.io/docs/tasks/tools/). Nothing else.

## Rules

- Don't modify `test/`, `src/` or the `Dockerfile`. The point is to fit the platform to the app's contract.
- Plain YAML only: no Helm, no Kustomize (that's module 35).
- Use the object names in the table above; the tests look objects up by kind and name.
- No real secrets anywhere. A throwaway local password in the Secret is fine, and say so in a comment.

## Stretch goals

1. Add a `startupProbe` and explain in a comment why it lets you keep the liveness probe aggressive.
2. Add an init container to the Job that waits for Postgres, so retries aren't wasted on a booting database.
3. Make the API pods pass the Pod Security `restricted` profile: add `seccompProfile: { type: RuntimeDefault }`, then label the namespace `pod-security.kubernetes.io/enforce: restricted` and see what gets rejected (hint: the Postgres pod).
4. Add `topologySpreadConstraints` (or pod anti-affinity) so the 3 replicas prefer different nodes. Create a 3-node kind cluster with a config file to see it work.
5. Kill a pod in a loop during a rolling update while hammering `/whoami` from a debug pod. Do you see any failed requests? What happens if you set `SHUTDOWN_DELAY_MS: "0"`?

## Done?

1. `npm test` is green and `npm run typecheck` is clean.
2. You've run the runbook end to end on a real kind cluster.
3. Commit on your branch `module/34-kubernetes-fundamentals`, push and open a PR. CI runs this module's tests.
4. From the repo root: `npm run progress -- 34`.
5. Answer the questions in [INTERVIEW.md](INTERVIEW.md).
6. Add an entry to [LOG.md](../LOG.md): what surprised you most about the gap between "applies cleanly" and "works"?
7. Compare with the reference solution: `git diff main origin/solutions -- 34-kubernetes-fundamentals/` (and read `SOLUTION.md` on that branch).

Stuck? → [HINTS.md](HINTS.md)
