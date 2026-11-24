# Hints · Kubernetes Fundamentals

Open one hint at a time. `kubectl explain <kind>.<field>` is also a hint machine: it documents every field.

## TODO 1: Namespace

<details><summary>Hint 1</summary>

A Namespace is about the smallest object there is: `apiVersion`, `kind`, `metadata.name`. No `spec` needed.
</details>

<details><summary>Hint 2</summary>

Every other object needs `metadata.namespace: kudos`. One test lists any object that's missing it, with its file name.
</details>

## TODO 2: ConfigMap and Secret

<details><summary>Hint 1</summary>

Two documents in one file, separated by a line containing only `---`. The ConfigMap's keys should be the exact env var names in `EnvSchema` in `src/config.ts`.
</details>

<details><summary>Hint 2</summary>

`DB_HOST` is the name of the Service in front of Postgres (you'll create it in TODO 5, call it `postgres`). Cluster DNS resolves Service names within the same namespace. Numbers must be quoted: `DB_PORT: "5432"`.
</details>

<details><summary>Hint 3</summary>

```yaml
apiVersion: v1
kind: Secret
metadata: { name: kudos-db, namespace: kudos }
type: Opaque
stringData:
  DB_PASSWORD: "..."
```
</details>

## TODO 3: Deployment

<details><summary>Hint 1</summary>

Start from `kubectl create deployment kudos-api --image=wl-kudos-api:1.0.0 --replicas=3 --dry-run=client -o yaml` and add to it. Name the container (e.g. `api`); you'll need that name for `kubectl set image` later.
</details>

<details><summary>Hint 2</summary>

Probes go on the container: `readinessProbe: { httpGet: { path: /readyz, port: http } }`. The `http` refers to the named container port. Env: `envFrom: [{ configMapRef: { name: kudos-config } }]` pulls in every ConfigMap key; for the password use `env` with `valueFrom.secretKeyRef`.
</details>

<details><summary>Hint 3</summary>

The security test fails with "runAsUser must be a non-zero integer"? The image's `USER node` is a name, and the kubelet can only verify `runAsNonRoot` against a number. `node` is uid 1000 in the official Node images. Pod-level `securityContext` takes `runAsNonRoot`/`runAsUser`; container-level takes `allowPrivilegeEscalation`, `readOnlyRootFilesystem` and `capabilities: { drop: ["ALL"] }`.
</details>

## TODO 4: Service

<details><summary>Hint 1</summary>

The Service's `selector` must match the **pod template's** labels, not the Deployment's own `metadata.labels` (they're often the same, but they don't have to be).
</details>

<details><summary>Hint 2</summary>

`ports: [{ name: http, port: 80, targetPort: http }]`. A named `targetPort` follows the container port if it ever changes.
</details>

## TODO 5: Postgres

<details><summary>Hint 1</summary>

The test "does NOT select any other workload's pods" fails? Your API and Postgres pods share a label that the API Service selects on. Give Postgres its own `app: postgres` label.
</details>

<details><summary>Hint 2</summary>

StatefulSet = Deployment-like spec + `serviceName` + `volumeClaimTemplates`. The claim template's `metadata.name` is what the container's `volumeMounts[].name` refers to. The headless Service is just a Service with `clusterIP: None`.
</details>

<details><summary>Hint 3</summary>

Map the shared config into Postgres's own variable names:

```yaml
env:
  - name: POSTGRES_USER
    valueFrom: { configMapKeyRef: { name: kudos-config, key: DB_USER } }
  - name: POSTGRES_PASSWORD
    valueFrom: { secretKeyRef: { name: kudos-db, key: DB_PASSWORD } }
```

For the probe, exec form doesn't expand `$VARS`, so wrap it: `["sh", "-c", 'pg_isready -h 127.0.0.1 -U "$POSTGRES_USER"']`.
</details>

## TODO 6: Migration Job

<details><summary>Hint 1</summary>

A Job's pod template looks like a Deployment's, plus a mandatory `restartPolicy` (`Never` or `OnFailure`, never `Always`).
</details>

<details><summary>Hint 2</summary>

The image's WORKDIR is `/app` and the build output is `dist/`, so `command: ["node", "dist/db/migrateCli.js"]`. Copy the env and security settings from the Deployment: the Job needs the same DB access.
</details>

## TODO 7: Runbook

<details><summary>Hint 1</summary>

Write it while you do it. Run each command, then paste it. The tests only look inside fenced code blocks.
</details>

<details><summary>Hint 2</summary>

Order: `kind create cluster --name ...` → `npm install` → `docker build -t <exact image from 40-api.yaml> .` → `kind load docker-image <same> --name ...` → `kubectl apply -f k8s/` → `kubectl rollout status` / `kubectl wait --for=condition=complete job/kudos-migrate` → `kubectl port-forward svc/kudos-api 8080:80` → `curl`.
</details>

<details><summary>Hint 3</summary>

Rolling update: build with `--build-arg APP_VERSION=1.0.1 -t wl-kudos-api:1.0.1`, load it, then `kubectl -n kudos set image deployment/kudos-api <container-name>=wl-kudos-api:1.0.1`, `rollout status`, and curl `/whoami`. Rollback: `rollout history`, `rollout undo`, curl again.
</details>

## TODO 8: ADR

<details><summary>Hint 1</summary>

Think about what a database needs that a stateless API doesn't: backups, point-in-time restore, upgrades, failover, storage performance. Who does each of those in each option?
</details>
