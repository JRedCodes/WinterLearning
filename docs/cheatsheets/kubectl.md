# kubectl & Kubernetes cheat sheet

> Everyday kubectl, manifest skeletons and the debugging workflow. Taught in [34 · Kubernetes Fundamentals](../../34-kubernetes-fundamentals/README.md) and [35 · Kubernetes in Practice](../../35-kubernetes-in-practice/README.md).

## Local cluster (kind)

```bash
kind create cluster --name wl
kubectl cluster-info --context kind-wl
docker build -t wl-api:dev .
kind load docker-image wl-api:dev --name wl      # kind can't see your local images otherwise
kind delete cluster --name wl
```

With a locally loaded image, set `imagePullPolicy: IfNotPresent` (or `Never`) and don't use the `:latest` tag (it defaults to `Always`).

## Context & namespaces

```bash
kubectl config get-contexts
kubectl config use-context kind-wl
kubectl create namespace wl
kubectl config set-context --current --namespace=wl   # stop typing -n wl
```

## Look around

```bash
kubectl get pods -o wide                 # node, IP, restarts
kubectl get deploy,rs,svc,ing,cm,secret,pvc
kubectl get all -n wl
kubectl get pods -l app=api              # filter by label
kubectl get pod api-7d9f -o yaml         # live object, incl. status
kubectl describe pod api-7d9f            # events at the bottom: read these first
kubectl get events --sort-by=.lastTimestamp
kubectl explain deployment.spec.strategy # built-in field docs
kubectl top pods                         # needs metrics-server
```

## Apply & change

```bash
kubectl apply -f k8s/                    # create/update everything in a folder
kubectl apply -k overlays/dev            # Kustomize
kubectl diff -f k8s/                     # what would change
kubectl delete -f k8s/
kubectl set image deploy/api api=wl-api:v2
kubectl scale deploy/api --replicas=5
kubectl rollout status deploy/api
kubectl rollout history deploy/api
kubectl rollout undo deploy/api          # back to the previous ReplicaSet
kubectl rollout restart deploy/api       # re-create pods (e.g. after a ConfigMap change)
```

## Get inside

```bash
kubectl logs deploy/api -f               # one pod of the deployment
kubectl logs api-7d9f --previous         # logs from the crashed container
kubectl logs -l app=api --all-containers --tail=100
kubectl exec -it api-7d9f -- sh
kubectl port-forward svc/api 8080:80     # localhost:8080 -> service port 80
kubectl run tmp --rm -it --image=busybox -- sh   # debug pod: wget/nslookup from inside the cluster
kubectl create secret generic api-secrets --from-literal=DATABASE_URL=postgres://... --dry-run=client -o yaml
```

## Manifest skeleton (Deployment + Service)

```yaml
apiVersion: apps/v1
kind: Deployment
metadata: { name: api, namespace: wl, labels: { app: api } }
spec:
  replicas: 3
  selector: { matchLabels: { app: api } }          # must match template labels
  strategy: { type: RollingUpdate, rollingUpdate: { maxUnavailable: 0, maxSurge: 1 } }
  template:
    metadata: { labels: { app: api } }
    spec:
      securityContext: { runAsNonRoot: true, runAsUser: 1000 }
      containers:
        - name: api
          image: wl-api:dev
          ports: [{ name: http, containerPort: 3000 }]
          envFrom:
            - configMapRef: { name: api-config }
            - secretRef: { name: api-secrets }
          readinessProbe: { httpGet: { path: /readyz, port: http }, periodSeconds: 5 }
          livenessProbe:  { httpGet: { path: /healthz, port: http }, initialDelaySeconds: 10 }
          resources:
            requests: { cpu: 100m, memory: 128Mi }
            limits:   { memory: 256Mi }
---
apiVersion: v1
kind: Service
metadata: { name: api, namespace: wl }
spec:
  selector: { app: api }                           # must match pod labels
  ports: [{ port: 80, targetPort: http }]          # targetPort = containerPort (name or number)
```

Inside the cluster the service is reachable at `http://api.wl.svc.cluster.local` (or just `http://api` from the same namespace).

## Failure states

| Status | Usually means | Look at |
|---|---|---|
| `Pending` | can't schedule: not enough CPU/memory, PVC unbound, node selector | `describe pod` events |
| `ImagePullBackOff` / `ErrImagePull` | wrong image name/tag, private registry, image not loaded into kind | events, `image:` field |
| `CrashLoopBackOff` | app starts then exits: bad config, missing env, failing migration | `logs --previous` |
| `OOMKilled` | exceeded memory limit | `describe pod` (Last State), raise limit or fix leak |
| `Running` but `0/1 READY` | readiness probe failing: wrong path/port, dependency down | `describe pod`, probe config |
| `CreateContainerConfigError` | referenced ConfigMap/Secret or key doesn't exist | events |
| Service has no endpoints | selector doesn't match pod labels | `kubectl get endpoints api` |

## Debugging flow

```
get pods -> describe pod (events) -> logs (--previous) -> get endpoints -> exec / port-forward -> fix manifest -> apply -> rollout status
```

## Helm basics

```bash
helm create chart                         # scaffold
helm template api ./chart -f values.yaml  # render locally (no cluster)
helm lint ./chart
helm install api ./chart -n wl --create-namespace
helm upgrade --install api ./chart -n wl --set image.tag=v2
helm list -n wl
helm rollback api 1 -n wl
helm uninstall api -n wl
```

## Gotchas

- Selector/label mismatch is the #1 "it applied but nothing works" bug. A Deployment's `spec.selector` is immutable after creation.
- Liveness probes that check the database restart healthy pods when the DB blips. Liveness = "is the process alive", readiness = "can it serve traffic".
- No memory limit = one pod can starve a node. No requests = the scheduler can't plan.
- Secrets are only base64-encoded, not encrypted, unless the cluster is configured for encryption at rest. Don't commit real ones.
- Changing a ConfigMap doesn't restart pods that read it as env vars. `rollout restart`.
- YAML: `on`, `yes`, `no` may parse as booleans and `08` as a string; quote values that must be strings (`"true"`, `"3000"` in env).
- Indentation errors produce valid-but-wrong YAML. `kubectl apply --dry-run=server -f` catches many.
