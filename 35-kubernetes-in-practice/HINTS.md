# Hints · Kubernetes in Practice

Open one hint at a time. For the incident, the hints are grouped by **symptom**, not by file, which is how you'd meet them on call.

## Symptom: pods stuck in `CreateContainerConfigError`

<details><summary>Hint 1</summary>

The container never even started, so there are no logs. What does the kubelet say in the pod's Events (`symptoms/02-describe-pod-config.txt`)?
</details>

<details><summary>Hint 2</summary>

Compare the key the Deployment asks for (`secretKeyRef.key`) with the keys the Secret actually has (the `jsonpath='{.data}'` output at the bottom of the same file).
</details>

<details><summary>Hint 3</summary>

You could change either side. Look at `local/migrate-job.yaml` to decide which side is wrong: two consumers expect the same key name, and it matches the env var name.
</details>

## Symptom: `OOMKilled` / `CrashLoopBackOff` with no logs

<details><summary>Hint 1</summary>

Exit code 137 is 128 + 9: SIGKILL. The reason field tells you who sent it.
</details>

<details><summary>Hint 2</summary>

Look at the `Limits:` in `02-describe-pod-config.txt`. How much memory does a Node.js process with Express and `pg` loaded need just to start?
</details>

<details><summary>Hint 3</summary>

Raise the memory limit (and the request) to something a Node app can live in: 128Mi request / 256Mi limit is a sane start. Keep requests ≤ limits.
</details>

## Symptom: `Running` but `0/1` ready

<details><summary>Hint 1</summary>

`events.txt` quotes the probe failure with a status code. A 404 means the request reached the app.
</details>

<details><summary>Hint 2</summary>

`04-describe-pod-running.txt` shows someone calling two different paths with `wget` from inside the pod. Compare with `src/routes/health.ts`.
</details>

## Symptom: Service has no endpoints

<details><summary>Hint 1</summary>

Pods are 1/1 Ready in `05-service-and-endpoints.txt`, yet endpoints are `<none>`. Endpoints are built from the Service's selector.
</details>

<details><summary>Hint 2</summary>

Put the `Selector:` line of `describe service` next to the `LABELS` column of `get pods --show-labels`. Selectors match on exact key=value pairs.
</details>

## Symptom: connection refused through the Service

<details><summary>Hint 1</summary>

`06-debug-pod.txt` bisects the path: Service → pod IP on one port → pod IP on another port. Which call works?
</details>

<details><summary>Hint 2</summary>

Which port does the app log that it listens on (`04-...`), which port does the ConfigMap set, and which ports do the Deployment's `containerPort` and the Service's `targetPort` say? Probes passed because they used a hard-coded number, not the named port.
</details>

<details><summary>Hint 3</summary>

Make the container port named `http` the real port, point the probes at `port: http`, and use `targetPort: http` in the Service so there's only one place the number lives.
</details>

## Symptom: Ingress returns 503 "no healthy upstream"

<details><summary>Hint 1</summary>

Everything works inside the cluster at this point (`07-ingress.txt`). Compare the Ingress backend's port with `kubectl get svc` output.
</details>

<details><summary>Hint 2</summary>

An Ingress backend talks to a **Service**, so `port.number` must be one of the Service's `port` values (or use `port.name`).
</details>

## TODO 7: HPA

<details><summary>Hint 1</summary>

`kubectl explain hpa.spec --api-version=autoscaling/v2` shows the shape. The CPU target lives under `metrics[].resource.target`.
</details>

<details><summary>Hint 2</summary>

```yaml
metrics:
  - type: Resource
    resource:
      name: cpu
      target: { type: Utilization, averageUtilization: ... }
```
And delete `replicas:` from the Deployment. Read the runbook's note on doing that safely on a live cluster.
</details>

## TODO 8: PDB

<details><summary>Hint 1</summary>

With 2 replicas, how many may a drain evict at once if the API must stay up? Which field values give you exactly that?
</details>

## TODO 9: Helm chart

<details><summary>Hint 1</summary>

Start from your fixed `broken/20-api.yaml`, delete `namespace:` and replace every hard-coded name, label set and value with a helper or `.Values` reference. `service.yaml` (provided) shows the style.
</details>

<details><summary>Hint 2</summary>

Labels: `{{- include "kudos-api.labels" . | nindent 4 }}` under `metadata.labels`, and `selectorLabels` under `matchLabels` (indent 6) and the pod template's labels (indent 8). Count the spaces.
</details>

<details><summary>Hint 3</summary>

```yaml
spec:
  {{- if not .Values.autoscaling.enabled }}
  replicas: {{ .Values.replicaCount }}
  {{- end }}
```
Optional objects: first line `{{- if .Values.ingress.enabled }}`, last line `{{- end }}`. If you have Helm installed, `helm template kudos-api ./chart` after every change is the fastest feedback loop there is.
</details>

<details><summary>Hint 4 — test says ".Values.x isn't defined"</summary>

Every `.Values.a.b` you reference must exist in `values.yaml`, even if it's empty (`annotations: {}`, `className: ""`). That's also what keeps `helm template` from failing with "nil pointer evaluating".
</details>
