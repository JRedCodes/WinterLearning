# Runbook · reproduce the incident, verify the fixes, ship the chart

> Provided for you. `npm test` checks your manifests and chart statically; this runbook is how
> you prove they work on a real cluster. Run everything from `35-kubernetes-in-practice/challenge/`.
> Commands that print "Error" while the manifests are still broken are expected: that's the incident.

## 0. Prerequisites

| Tool | Check | Install |
|---|---|---|
| Docker (daemon running) | `docker version` | https://docs.docker.com/get-docker/ |
| kind | `kind version` | https://kind.sigs.k8s.io/docs/user/quick-start/#installation |
| kubectl | `kubectl version --client` | https://kubernetes.io/docs/tasks/tools/ |
| Helm 3 or 4 | `helm version` | https://helm.sh/docs/intro/install/ |
| cloud-provider-kind | `cloud-provider-kind --help` | `go install sigs.k8s.io/cloud-provider-kind@latest`, `brew install cloud-provider-kind`, or a binary from https://github.com/kubernetes-sigs/cloud-provider-kind/releases |

cloud-provider-kind gives a kind cluster what a cloud gives a real one: LoadBalancer Services
and, in recent versions, a built-in Ingress implementation registered as the default
IngressClass. That's why `broken/40-ingress.yaml` has no `ingressClassName`.

## 1. Cluster, load balancer, metrics

```bash
kind create cluster --name wl
kubectl get nodes
```

In a **second terminal**, leave this running for the whole session (macOS and WSL2 need `sudo`;
on Windows use an Administrator shell):

```bash
cloud-provider-kind
```

Install metrics-server so `kubectl top` and the HPA have CPU numbers. kind's kubelets use
self-signed certificates, hence the extra flag (local clusters only, never in production):

```bash
kubectl apply -f https://github.com/kubernetes-sigs/metrics-server/releases/latest/download/components.yaml
kubectl -n kube-system patch deployment metrics-server --type=json \
  -p='[{"op":"add","path":"/spec/template/spec/containers/0/args/-","value":"--kubelet-insecure-tls"}]'
kubectl -n kube-system rollout status deployment/metrics-server
kubectl top nodes        # may take ~1 minute before it returns numbers
```

## 2. Build and load the image

```bash
npm install                                   # the Dockerfile needs package-lock.json
docker build -t wl-kudos-api:1.0.0 .
kind load docker-image wl-kudos-api:1.0.0 --name wl
```

## 3. Reproduce the incident

```bash
kubectl apply -f broken/        # namespace first (00-), then the rest
kubectl apply -f local/         # stand-in for the managed Postgres + the migration Job
kubectl config set-context --current --namespace=kudos
kubectl get pods -w             # Ctrl-C when you've seen enough
```

Now investigate the way you would in production, and compare with `symptoms/`:

```bash
kubectl get deploy,rs,pods,svc,endpoints,ingress
kubectl describe pod -l app=kudos-api | less      # Events at the bottom
kubectl get events --sort-by=.lastTimestamp
kubectl logs deploy/kudos-api --previous           # once containers actually start
kubectl get pods --show-labels
kubectl describe svc kudos-api
kubectl get ingress kudos-api -o yaml
```

## 4. Fix loop

Edit the files in `broken/` (never `kubectl edit` the live objects: that's how the incident's
hot-fixes got lost), then:

```bash
npm test                                           # fast feedback, no cluster needed
kubectl apply -f broken/
kubectl rollout status deployment/kudos-api --timeout=120s
kubectl get pods,endpoints
```

The migration Job starts by itself once the Secret has the right key (its pod was waiting on
`CreateContainerConfigError`). Check it with `kubectl logs job/kudos-migrate`.

> **Removing `spec.replicas` (TODO 7).** With client-side `kubectl apply`, deleting a field
> from the file makes kubectl *remove* it from the live object, which resets the Deployment
> to the default of 1 replica until the HPA scales it back up. To hand the count over cleanly,
> first drop the field from the last-applied record, then apply:
>
> ```bash
> kubectl apply edit-last-applied deployment/kudos-api   # delete the spec.replicas line, save, quit
> kubectl apply -f broken/
> ```

## 5. Verify everything works

From inside the cluster (Service, DNS, ports):

```bash
kubectl run curl --rm -it --restart=Never --image=curlimages/curl -- \
  sh -c 'for i in 1 2 3 4; do curl -s http://kudos-api/whoami; echo; done'
```

Through the Ingress (cloud-provider-kind publishes an IP in the Ingress status):

```bash
kubectl get ingress kudos-api
INGRESS_IP=$(kubectl get ingress kudos-api -o jsonpath='{.status.loadBalancer.ingress[0].ip}')
curl -s -H 'Host: kudos.localtest.me' "http://${INGRESS_IP}/whoami"
curl -s -H 'Host: kudos.localtest.me' "http://${INGRESS_IP}/kudos"
```

If the IP isn't reachable from your host (common with Docker Desktop on macOS/Windows, where
container IPs aren't routed), run the same curl from inside the cluster, which proves the
Ingress works too:

```bash
kubectl run curl --rm -it --restart=Never --image=curlimages/curl -- \
  curl -s -H 'Host: kudos.localtest.me' "http://${INGRESS_IP}/whoami"
```

Autoscaling and disruption budget:

```bash
kubectl get hpa kudos-api           # TARGETS shows cpu: <n>%/70% once metrics arrive
kubectl get pdb kudos-api           # ALLOWED DISRUPTIONS should be 1 with 2 pods
kubectl top pods
```

Generate load and watch the HPA react (it checks every 15s; scale-down waits 5 minutes):

```bash
kubectl run load --restart=Never --image=busybox -- \
  sh -c 'while true; do wget -qO- http://kudos-api/kudos > /dev/null; done'
kubectl get hpa kudos-api -w        # Ctrl-C after you see REPLICAS grow
kubectl delete pod load
```

## 6. Ship it with Helm

Static checks first (no cluster needed):

```bash
helm lint ./chart
helm template kudos-api ./chart --namespace kudos-helm > /tmp/kudos-rendered.yaml
less /tmp/kudos-rendered.yaml       # read what Helm will send: names, labels, replicas (absent), probes
helm template kudos-api ./chart --set autoscaling.enabled=false | grep -n 'replicas:'   # now it's there
```

Install the chart as a second copy of the app in its own namespace, reusing the Postgres from
step 3 through cross-namespace DNS. The chart expects the password Secret to exist already:

```bash
kubectl create namespace kudos-helm
kubectl -n kudos-helm create secret generic kudos-db \
  --from-literal=DB_PASSWORD=local-dev-only-not-a-real-secret
helm upgrade --install kudos-api ./chart -n kudos-helm \
  --set config.DB_HOST=postgres.kudos.svc.cluster.local \
  --set ingress.host=kudos-helm.localtest.me
kubectl -n kudos-helm rollout status deployment/kudos-api
kubectl -n kudos-helm get deploy,svc,ingress,hpa,pdb,cm
helm list -n kudos-helm
curl -s -H 'Host: kudos-helm.localtest.me' "http://${INGRESS_IP}/whoami"
```

(If the Helm release's Ingress gets a different IP, read it with
`kubectl -n kudos-helm get ingress kudos-api`.)

Change a value and watch the config checksum trigger a rollout, then roll back:

```bash
helm upgrade kudos-api ./chart -n kudos-helm --reuse-values --set config.LOG_LEVEL=debug
kubectl -n kudos-helm rollout status deployment/kudos-api
helm history kudos-api -n kudos-helm
helm rollback kudos-api 1 -n kudos-helm
helm get values kudos-api -n kudos-helm --all | head -20
```

## 7. Clean up

```bash
helm uninstall kudos-api -n kudos-helm
kubectl delete namespace kudos-helm kudos
kind delete cluster --name wl
```

Then stop `cloud-provider-kind` in the other terminal with Ctrl-C.
