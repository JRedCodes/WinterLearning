# kubectl cheat sheet (module 34 edition)

The repo-wide [kubectl cheat sheet](../../docs/cheatsheets/kubectl.md) covers the everyday basics. This page is organised around the questions you'll actually ask while doing the challenge, with the namespace and names from it.

## Setup and context

```bash
kind create cluster --name wl            # also sets your kubectl context to kind-wl
kubectl config current-context           # which cluster am I about to change?
kubectl config get-contexts
kubectl config use-context kind-wl
kubectl config set-context --current --namespace=kudos   # default namespace for this context
kind get clusters
kind load docker-image wl-kudos-api:1.0.0 --name wl
kind delete cluster --name wl
```

> Make `kubectl config current-context` a reflex before anything destructive. Plenty of people have deleted things in the wrong cluster.

## "What's running?"

```bash
kubectl get all -n kudos                         # deploy, rs, pods, svc, statefulsets, jobs (not cm/secret/pvc)
kubectl get pods -n kudos -o wide                # + node, pod IP, restarts
kubectl get pods -n kudos -l app=kudos-api       # by label
kubectl get pods -n kudos --show-labels
kubectl get pods -n kudos -w                     # watch changes live (great during a rollout)
kubectl get cm,secret,pvc,endpoints -n kudos
kubectl get events -n kudos --sort-by=.lastTimestamp
kubectl api-resources                            # every kind the cluster knows, with short names
```

Short names save typing: `po` pods, `deploy`, `rs`, `svc`, `cm`, `sts` statefulsets, `pvc`, `ns`, `ep` endpoints.

## "Why isn't it working?"

```bash
kubectl describe pod <pod> -n kudos              # read the Events section at the bottom first
kubectl logs <pod> -n kudos                      # current container
kubectl logs <pod> -n kudos --previous           # the container that just crashed
kubectl logs deploy/kudos-api -n kudos           # picks one pod of the deployment
kubectl logs -l app=kudos-api -n kudos --prefix  # all pods, each line prefixed with its pod
kubectl logs job/kudos-migrate -n kudos
kubectl get endpoints kudos-api -n kudos         # empty = selector matches no ready pod
kubectl exec -it <pod> -n kudos -- sh            # alpine images have sh and wget (no curl)
kubectl exec <pod> -n kudos -- wget -qO- localhost:3000/readyz
kubectl run tmp -n kudos --rm -it --restart=Never --image=busybox -- sh   # throwaway debug pod
#   inside: nslookup postgres ; wget -qO- http://kudos-api/whoami
```

## "Show me exactly one field"

```bash
kubectl get deploy kudos-api -n kudos -o yaml                     # live object incl. status
kubectl get deploy kudos-api -n kudos -o jsonpath='{.spec.template.spec.containers[0].image}'
kubectl get pods -n kudos -o jsonpath='{range .items[*]}{.metadata.name}{"\t"}{.status.phase}{"\n"}{end}'
kubectl get secret kudos-db -n kudos -o jsonpath='{.data.DB_PASSWORD}' | base64 -d   # yes, that easy
kubectl explain deployment.spec.strategy.rollingUpdate            # field docs
kubectl explain pod.spec.containers.readinessProbe --recursive | head -40
```

## Apply, diff, delete

```bash
kubectl apply -f k8s/                     # files are applied in name order
kubectl apply -f k8s/ --dry-run=server    # full server-side validation, changes nothing
kubectl diff -f k8s/                      # what would change (exit code 1 when there are diffs)
kubectl delete -f k8s/
kubectl delete job kudos-migrate -n kudos # Jobs are immutable: delete then re-apply to re-run
kubectl delete namespace kudos            # everything inside it, PVCs included
```

## Rollouts

```bash
kubectl set image deployment/kudos-api api=wl-kudos-api:1.0.1 -n kudos   # `api` = container name
kubectl rollout status deployment/kudos-api -n kudos
kubectl rollout history deployment/kudos-api -n kudos
kubectl rollout history deployment/kudos-api -n kudos --revision=2
kubectl rollout undo deployment/kudos-api -n kudos [--to-revision=1]
kubectl rollout restart deployment/kudos-api -n kudos    # new pods, same spec (after a ConfigMap change)
kubectl rollout pause|resume deployment/kudos-api -n kudos
kubectl scale deployment/kudos-api --replicas=5 -n kudos
kubectl annotate deployment/kudos-api kubernetes.io/change-cause="upgrade to 1.0.1" -n kudos --overwrite
```

## Reaching things from your laptop

```bash
kubectl port-forward svc/kudos-api 8080:80 -n kudos      # localhost:8080 -> Service port 80
kubectl port-forward pod/postgres-0 5434:5432 -n kudos   # then psql -h localhost -p 5434 -U kudos kudos
```

`port-forward` to a Service picks a single pod and stays on it until the pod goes away, then the forward breaks. It's a debugging tool, not a load balancer.

## Generating YAML instead of typing it

```bash
kubectl create deployment demo --image=nginx --replicas=2 --dry-run=client -o yaml
kubectl create service clusterip demo --tcp=80:8080 --dry-run=client -o yaml
kubectl create configmap demo --from-literal=LOG_LEVEL=info --dry-run=client -o yaml
kubectl create secret generic demo --from-literal=DB_PASSWORD=x --dry-run=client -o yaml
kubectl create job demo --image=busybox --dry-run=client -o yaml -- echo hi
```

Good starting skeletons. Then add probes, resources and securityContext by hand.
