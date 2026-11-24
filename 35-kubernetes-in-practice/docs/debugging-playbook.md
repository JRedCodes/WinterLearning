# Kubernetes debugging playbook

A checklist to work through under pressure. The lesson's flowchart is the map; this is the turn-by-turn directions. Replace `-n kudos` and names with yours.

## Rule zero: capture before you change

Events expire (about an hour by default), crashed containers' logs get replaced on the next crash, and every hot-fix changes the evidence. Before touching anything:

```bash
mkdir -p incident && cd incident
kubectl -n kudos get all,endpoints,ingress,hpa,pdb -o wide > 01-state.txt
kubectl -n kudos get events --sort-by=.lastTimestamp > 02-events.txt
kubectl -n kudos describe pods -l app=kudos-api > 03-describe.txt
for p in $(kubectl -n kudos get pods -l app=kudos-api -o name); do
  kubectl -n kudos logs "$p" --previous > "04-${p#pod/}-previous.log" 2>&1
  kubectl -n kudos logs "$p" > "04-${p#pod/}.log" 2>&1
done
```

Then mitigate if users are affected (`kubectl rollout undo`, `helm rollback`), and *then* debug.

## Step 1: which layer is broken?

```
Is the pod scheduled?           -> Pending?                 -> Step 2
Did the container start?        -> *ImagePull*, *ConfigError -> Step 3
Does it stay up?                -> CrashLoopBackOff, OOMKilled -> Step 4
Is it ready?                    -> Running 0/1               -> Step 5
Does the Service reach it?      -> endpoints empty / refused -> Step 6
Does the Ingress reach the Service? -> 404 / 502 / 503       -> Step 7
```

## Step 2: Pending

```bash
kubectl -n kudos describe pod <pod> | sed -n '/Events:/,$p'
kubectl describe nodes | grep -A6 "Allocated resources"
kubectl -n kudos get pvc
```

| Event message | Fix |
|---|---|
| `0/3 nodes are available: 3 Insufficient memory` | lower requests, or add nodes (autoscaler) |
| `pod has unbound immediate PersistentVolumeClaims` | no default StorageClass / wrong class name / zone mismatch |
| `node(s) didn't match Pod's node affinity/selector` | labels on nodes vs `nodeSelector` |
| `node(s) had untolerated taint` | add a toleration or schedule elsewhere |

## Step 3: the container never starts

```bash
kubectl -n kudos describe pod <pod> | sed -n '/Events:/,$p'
kubectl -n kudos get pod <pod> -o jsonpath='{.spec.containers[*].image}'
```

- `ErrImagePull` / `ImagePullBackOff`: `Failed to pull image ... not found` → name/tag typo, or (kind) `kind load docker-image` forgotten. `unauthorized` → `imagePullSecrets`.
- `CreateContainerConfigError`:
  - `couldn't find key X in Secret ns/name` → the key name differs. Compare `kubectl get secret name -o jsonpath='{.data}'` with the `secretKeyRef.key`.
  - `configmap "x" not found` → wrong name or wrong namespace.
  - `container has runAsNonRoot and image has non-numeric user` → add `runAsUser`.

## Step 4: it starts, then dies

```bash
kubectl -n kudos logs <pod> --previous
kubectl -n kudos get pod <pod> -o jsonpath='{.status.containerStatuses[0].lastState}'
kubectl -n kudos top pod <pod>
```

| Last State | Meaning |
|---|---|
| `Reason: OOMKilled, Exit Code: 137` | memory limit too low or a leak. No logs is typical: killed before writing anything. |
| `Reason: Error, Exit Code: 1` + a stack trace in `--previous` | app crash: config validation failed, missing env, DB unreachable at boot |
| `Exit Code: 137` without OOMKilled | SIGKILL: liveness probe failure (check Events) or grace period exceeded |
| `Exit Code: 127` / `126` | `command` not found / not executable |

If the container dies too fast to inspect, temporarily override the command in a **copy** of the pod:

```bash
kubectl -n kudos debug <pod> -it --copy-to=debug-copy --container=api -- sh
```

## Step 5: Running but not ready

```bash
kubectl -n kudos describe pod <pod> | grep -A3 -E "Readiness|Liveness|Startup"
kubectl -n kudos get events --field-selector involvedObject.name=<pod>
kubectl -n kudos exec <pod> -- wget -qO- localhost:3000/readyz     # what does the app actually say?
```

- `HTTP probe failed with statuscode: 404` → wrong `path`.
- `connect: connection refused` → wrong `port` (or the app isn't listening yet: startupProbe).
- `statuscode: 503` → the app says it's not ready: read its readiness body / logs (DB down? draining?).
- `context deadline exceeded` → `timeoutSeconds` too low or the event loop is blocked.

## Step 6: the Service doesn't route

```bash
kubectl -n kudos get endpoints <svc>                        # or: get endpointslices -l kubernetes.io/service-name=<svc>
kubectl -n kudos get svc <svc> -o jsonpath='{.spec.selector}{"\n"}{.spec.ports}{"\n"}'
kubectl -n kudos get pods --show-labels
kubectl -n kudos run debug --rm -it --restart=Never --image=busybox -- sh
#   wget -qO- -T3 http://<svc>/healthz        (DNS + Service)
#   wget -qO- -T3 http://<podIP>:<port>/healthz (bypass the Service)
#   nslookup <svc>
```

- Endpoints `<none>` and pods are ready → selector doesn't match labels.
- Endpoints `<none>` and pods are not ready → go back to step 5.
- Endpoints list `IP:8080` but the app listens on 3000 → `targetPort` (or a named port pointing at the wrong `containerPort`).

## Step 7: the Ingress doesn't route

```bash
kubectl -n kudos get ingress
kubectl -n kudos describe ingress <name>          # backends + events
kubectl get ingressclass                          # which classes exist, which is default?
kubectl -n <controller-ns> logs deploy/<controller> --tail=100
curl -sv -H 'Host: kudos.localtest.me' http://<ingress-ip>/healthz
```

- `404` from the controller → no rule matched: wrong host header, wrong class (another controller owns it), path/pathType.
- `503` / `502` → rule matched, but the backend Service/port doesn't exist or has no ready endpoints. Check that `backend.service.port.number` is a **Service** port.
- Ingress has no ADDRESS → no controller is handling this class.

## Step 8: fix it properly

1. Change the manifest / chart in git, not the live object.
2. `kubectl diff -f ...` or `helm template` + review.
3. Apply, then `kubectl rollout status` and re-run the check that failed.
4. Write down symptom → root cause → fix while it's fresh. That's half your postmortem.
