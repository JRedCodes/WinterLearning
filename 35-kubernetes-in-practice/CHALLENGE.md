# Challenge · The kudos-api staging incident

**Type:** 🐛 Debug (+ 🛠️ build a Helm chart) · **Est:** 4–5h · **Services:** none for `npm test`; Docker + kind + kubectl + helm + cloud-provider-kind for the runbook

## Scenario

> **#incident-kudos-staging** · *Dani (platform):* Post-incident handover. Friday's kudos-api deploy to staging went sideways. Over an hour, three of us hot-fixed things one after another with `kubectl edit` until it served traffic again, and **none of it was committed**. Then Monday's redeploy from git brought every problem back. 🙃
>
> Everything we captured is in `symptoms/`. The manifests as they are in git are in `broken/`. Can you:
> 1. find and fix every problem **in the files**, so `kubectl apply -f broken/` just works,
> 2. add the HPA and PDB we promised the SRE team (2–10 replicas at 70% CPU, and node drains must never take the API fully down),
> 3. turn the whole thing into a Helm chart in `chart/` so staging and prod stop being copy-pasted YAML,
> 4. write a short ADR on how we package and ship this from now on.
>
> There are **6 distinct problems** in `broken/`. The app itself (`src/`) is fine: it's the same kudos API as module 34, and its contract (port, probe endpoints, env vars) hasn't changed.

## Your task

### Part A: debug (TODO 1–6)

Read `symptoms/README.md`, then the captures in order. For each problem, work out the **root cause** from the evidence, then fix it in `broken/`. The six problems are in these files (not one per file):

- `broken/10-config.yaml`
- `broken/20-api.yaml`
- `broken/30-service.yaml`
- `broken/40-ingress.yaml`

The app's contract, for reference: it listens on `PORT` (from the ConfigMap), liveness is `GET /healthz`, readiness is `GET /readyz`, and it reads `DB_PASSWORD` from the environment. `local/` (a stand-in Postgres and the migration Job) is correct and must keep working with your fixes: the migration Job reads the same Secret.

### Part B: scale and survive (TODO 7–8)

| TODO | File | What |
|---|---|---|
| 7 | `broken/50-hpa.yaml` | HPA `kudos-api` (autoscaling/v2): min 2, max 10, 70% average CPU. Then remove `spec.replicas` from the Deployment. |
| 8 | `broken/60-pdb.yaml` | PDB `kudos-api` (policy/v1) selecting the API pods, keeping at least one up, yet still allowing drains at 2 replicas. |

### Part C: package it (TODO 9)

In `chart/`, `Chart.yaml`, `_helpers.tpl`, `configmap.yaml`, `service.yaml` and `NOTES.txt` are provided. You write:

| TODO | File | What |
|---|---|---|
| 9 | `values.yaml` | add `resources`, `ingress`, `autoscaling`, `podDisruptionBudget` (keys listed in the file) |
| 9a | `templates/deployment.yaml` | the fixed Deployment, templated: helpers for names/labels, replicas only without autoscaling, image from repository + tag (default `.Chart.AppVersion`), probes on port `http`, ConfigMap + existing Secret, `toYaml` for resources and security contexts |
| 9b | `templates/ingress.yaml` | behind `ingress.enabled`; optional `ingressClassName`; backend = this chart's Service on `.Values.service.port` |
| 9c | `templates/hpa.yaml` | behind `autoscaling.enabled`; targets this chart's Deployment |
| 9d | `templates/pdb.yaml` | behind `podDisruptionBudget.enabled`; selector labels helper |

### Part D: decide (TODO 10)

`DECISIONS.md`: raw manifests vs Kustomize vs Helm (vs GitOps on top) for running kudos-api in dev, staging and prod.

## Acceptance criteria

**Incident fixed (`test/incident.test.ts`, `test/ingress.test.ts`)**
- [ ] Nothing that was working got broken: all objects still exist, the Deployment's own selector matches, rollout and security settings are intact.
- [ ] The Service's selector matches the API pods.
- [ ] The container port named `http` is the port the app listens on, and the Service's `targetPort` reaches it.
- [ ] Readiness probes `/readyz`, liveness probes `/healthz`, every probe targets the app's port, and every probe path returns 200 from the real app.
- [ ] Memory limit ≥ 128Mi; requests ≤ limits.
- [ ] Every ConfigMap/Secret reference resolves; `DB_PASSWORD` comes from the Secret, the local migration Job can read it too, and it matches local Postgres's password.
- [ ] The Ingress (networking.k8s.io/v1, host `kudos.localtest.me`) points at an existing Service on a port that Service exposes.

**Scaling (`test/scaling.test.ts`)**
- [ ] HPA: autoscaling/v2, targets Deployment `kudos-api`, min 2, max 10, CPU Utilization 70; the Deployment keeps a CPU request and no longer sets `spec.replicas`.
- [ ] PDB: policy/v1, selects the API pods, exactly one of `minAvailable`/`maxUnavailable`, at least one pod protected and at least one eviction allowed at 2 replicas.

**Helm chart (`test/chart.test.ts`)**
- [ ] values.yaml defines all required keys, with defaults matching the fixed manifests (HPA 2/10/70, PDB minAvailable 1, memory limit ≥ 128Mi); `config` only holds env vars the app reads (no `PORT`, no secrets).
- [ ] All six templates exist, have balanced `{{ }}` and blocks, only reference values that exist, use the fullname helper for names and never hard-code a namespace.
- [ ] Ingress, HPA and PDB templates are wrapped in their `enabled` conditionals.
- [ ] Deployment, Ingress, HPA and PDB templates follow the patterns listed in Part C.

**ADR (`test/decisions.test.ts`)**
- [ ] Context, Options considered, Decision, Consequences each have at least 20 words.

Then **prove it on a cluster** with [RUNBOOK.md](challenge/RUNBOOK.md): reproduce the incident with the original files, fix, re-apply, curl through the Ingress, watch the HPA scale, install the chart.

## Getting started

```bash
cd 35-kubernetes-in-practice/challenge
make install
make test         # app tests and the "never broken" checks pass; the incident, scaling and chart tests fail
```

Then open `symptoms/README.md`. Resist reading the test files first: the point is to practise getting from evidence to root cause, which is what you'll do on call.

## Rules

- Don't modify `test/`, `src/`, `local/`, `symptoms/`, the `Dockerfile`, `Chart.yaml` or `_helpers.tpl`.
- Fix root causes in the files. Don't rename objects or delete working settings to make a test pass.
- For each fix, be able to point at the line in `symptoms/` that proves it (you'll want that for the interview questions).
- No real secrets in the chart: it references an existing Secret.

## Stretch goals

1. Write `POSTMORTEM.md`: timeline from `symptoms/`, the six root causes, why each hot-fix hid the next problem, and three action items (hint: one of them is "no more `kubectl edit` in staging").
2. Add a `values-prod.yaml` (bigger resources, `maxReplicas: 20`, real host, `ingress.className`) and diff `helm template` output between defaults and prod.
3. Add a `templates/migrate-job.yaml` as a Helm hook (`pre-upgrade`, plus `post-install`), and work out why `pre-install` alone would fail on a fresh namespace.
4. Rewrite the fixed `broken/` as a Kustomize base with `dev` and `prod` overlays and compare the two approaches in your ADR.
5. Replace the Ingress with Gateway API `HTTPRoute` (cloud-provider-kind implements Gateway API with the `cloud-provider-kind` GatewayClass) and note what got better.
6. Add a CronJob that calls `GET /kudos?limit=5` every 5 minutes as a synthetic check, with `concurrencyPolicy: Forbid`.

## Done?

1. `npm test` is green and `npm run typecheck` is clean.
2. You've run the runbook on a real kind cluster, including the Helm install.
3. Commit on your branch `module/35-kubernetes-in-practice`, push and open a PR. CI runs this module's tests.
4. From the repo root: `npm run progress -- 35`.
5. Answer the questions in [INTERVIEW.md](INTERVIEW.md).
6. Add an entry to [LOG.md](../LOG.md): which symptom was the most misleading, and why?
7. Compare with the reference solution: `git diff main origin/solutions -- 35-kubernetes-in-practice/` (and read `SOLUTION.md` on that branch).

Stuck? → [HINTS.md](HINTS.md)
