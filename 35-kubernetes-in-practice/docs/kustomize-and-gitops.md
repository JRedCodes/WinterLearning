# Kustomize and GitOps, a little deeper

## Kustomize: base and overlays

Kustomize is built into kubectl (`kubectl apply -k`, `kubectl kustomize`). It never templates: it loads plain YAML and transforms it.

```
deploy/
  base/
    kustomization.yaml
    deployment.yaml   # the fixed broken/20-api.yaml, without namespace
    service.yaml
    ingress.yaml
  overlays/
    dev/kustomization.yaml
    prod/
      kustomization.yaml
      hpa.yaml
      pdb.yaml
      resources-patch.yaml
```

```yaml
# base/kustomization.yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
resources: [deployment.yaml, service.yaml, ingress.yaml]
labels:
  - pairs: { app.kubernetes.io/part-of: kudos }
    includeSelectors: false        # don't touch selectors (immutable!)
configMapGenerator:
  - name: kudos-config
    literals: [LOG_LEVEL=info, DB_HOST=postgres, DB_PORT=5432]
```

```yaml
# overlays/prod/kustomization.yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
namespace: kudos-prod
resources:
  - ../../base
  - hpa.yaml
  - pdb.yaml
images:
  - name: wl-kudos-api
    newName: registry.example.com/kudos-api
    newTag: "1.4.2"
patches:
  - path: resources-patch.yaml     # strategic merge patch: a partial Deployment
  - target: { kind: Ingress, name: kudos-api }
    patch: |
      - op: replace
        path: /spec/rules/0/host
        value: kudos.example.com
configMapGenerator:
  - name: kudos-config
    behavior: merge
    literals: [LOG_LEVEL=warn, DB_HOST=kudos-prod.cluster-abc.eu-west-1.rds.amazonaws.com]
```

```yaml
# overlays/prod/resources-patch.yaml
apiVersion: apps/v1
kind: Deployment
metadata: { name: kudos-api }
spec:
  template:
    spec:
      containers:
        - name: api                 # list items are matched by name in strategic merge
          resources:
            limits: { memory: 512Mi }
```

Two features worth knowing:

- **`configMapGenerator` appends a content hash** to the ConfigMap name (`kudos-config-7g9k2m`) and rewrites references to it. Changing config therefore changes the pod template and triggers a rollout: Kustomize's version of Helm's checksum annotation.
- **`images:`** retags without patching, which is what CI or GitOps image updaters edit.

Render and inspect: `kubectl kustomize overlays/prod | less`. Apply: `kubectl apply -k overlays/prod`.

## GitOps with Argo CD (or Flux)

An Argo CD `Application` points at a path in git and a destination cluster/namespace:

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata: { name: kudos-api-prod, namespace: argocd }
spec:
  project: default
  source:
    repoURL: https://github.com/acme/deploy.git
    targetRevision: main
    path: apps/kudos-api/chart
    helm:
      valueFiles: [values-prod.yaml]
  destination:
    server: https://kubernetes.default.svc
    namespace: kudos-prod
  syncPolicy:
    automated: { prune: true, selfHeal: true }   # delete removed objects, revert manual drift
    syncOptions: [CreateNamespace=true]
```

What changes in daily work:

| Before | With GitOps |
|---|---|
| `helm upgrade` from a laptop or CI with cluster-admin credentials | merge a PR; the agent applies it |
| "what's running in prod?" → ask around, `helm get values` | read the repo at `main` |
| hot-fix with `kubectl edit`, forget to commit | the edit shows as OutOfSync and self-heal reverts it; fixes must be PRs |
| rollback = `helm rollback` and hope | `git revert` |

Things to plan for:

- **Secrets**: plain Secrets can't go in git. Options: Sealed Secrets (encrypt with the cluster's public key), SOPS (encrypted files, decrypted by the agent), External Secrets Operator (git holds a reference, the operator fetches from AWS Secrets Manager/Vault/GCP Secret Manager).
- **Image updates**: CI builds `kudos-api:1.4.3` and opens a PR bumping the tag (or an image updater does it automatically for lower environments).
- **Ordering**: sync waves / hooks for "migrations before the Deployment".
- **Emergencies**: you can pause auto-sync during an incident, but the fix still ends as a commit.
- **Repo layout**: an app repo (code + Dockerfile) and a separate deploy/config repo is common, so a deploy doesn't need a code change and access can differ.

Flux has the same model with different resources (`GitRepository`, `Kustomization`, `HelmRelease`). Pick whichever your platform team runs; the principles carry over.
