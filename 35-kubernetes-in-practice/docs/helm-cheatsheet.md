# Helm cheat sheet

## Commands

```bash
helm create mychart                                  # scaffold a chart (great reference for idioms)
helm lint ./chart                                    # structural checks
helm template kudos-api ./chart -n kudos-helm        # render locally, no cluster
helm template kudos-api ./chart -f values-prod.yaml --set image.tag=1.4.2 --show-only templates/hpa.yaml
helm install kudos-api ./chart -n kudos-helm --create-namespace
helm upgrade --install kudos-api ./chart -n kudos-helm -f values-staging.yaml   # idempotent deploy
helm upgrade kudos-api ./chart -n kudos-helm --reuse-values --set config.LOG_LEVEL=debug
helm upgrade ... --atomic --timeout 5m               # roll back automatically if the upgrade fails
helm list -n kudos-helm                              # releases (-A for all namespaces)
helm status kudos-api -n kudos-helm
helm history kudos-api -n kudos-helm
helm rollback kudos-api 2 -n kudos-helm              # back to revision 2
helm get values kudos-api -n kudos-helm [--all]      # user-supplied (or all) values
helm get manifest kudos-api -n kudos-helm            # what was actually applied
helm uninstall kudos-api -n kudos-helm

# third-party charts
helm repo add metrics-server https://kubernetes-sigs.github.io/metrics-server/
helm repo update
helm search repo metrics-server
helm show values metrics-server/metrics-server | less
helm install oci://registry.example.com/charts/thing --version 1.2.3    # charts from OCI registries
```

## Value precedence (lowest → highest)

1. chart's `values.yaml`
2. parent chart's values (for subcharts)
3. `-f file.yaml` (multiple allowed, later wins)
4. `--set` / `--set-string` / `--set-file` (later wins)

`--set a.b=1,c[0]=x` for nested keys and lists. `--set-string` forces strings (handy for `"5432"`).

## Template syntax

```yaml
{{ .Values.image.repository }}                      # value
{{ .Release.Name }} {{ .Release.Namespace }}        # release info
{{ .Chart.Name }} {{ .Chart.Version }} {{ .Chart.AppVersion }}
{{ include "kudos-api.fullname" . }}                # named template (pipe-able)
{{- ... }} {{ ... -}}                               # trim whitespace before / after
{{ .Values.port | quote }}                          # "3000"
{{ .Values.tag | default .Chart.AppVersion }}
{{ required "image.repository is required" .Values.image.repository }}
{{- toYaml .Values.resources | nindent 12 }}        # subtree as YAML, newline + indent
{{ .Values.name | lower | trunc 63 | trimSuffix "-" }}
{{ include (print $.Template.BasePath "/configmap.yaml") . | sha256sum }}
```

Control flow:

```yaml
{{- if .Values.ingress.enabled }}
...
{{- else if .Values.service.expose }}
...
{{- end }}

{{- range $key, $value := .Values.config }}
{{ $key }}: {{ $value | quote }}                     # inside range, `.` is the item: use $ for root
{{- end }}

{{- with .Values.ingress.annotations }}              # skipped if empty; `.` becomes the annotations
annotations:
  {{- toYaml . | nindent 4 }}
{{- end }}
```

Falsy values for `if`/`with`: `false`, `0`, `""`, `nil`, empty list, empty map.

## Named templates (`_helpers.tpl`)

```yaml
{{- define "kudos-api.selectorLabels" -}}
app.kubernetes.io/name: {{ include "kudos-api.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}
```

Files starting with `_` don't render manifests. Prefix template names with the chart name: names are global across subcharts.

## Indentation: the one rule

`nindent N` = newline, then indent every line by N spaces. Count the spaces to where the block should start:

```yaml
spec:
  template:
    metadata:
      labels:
        {{- include "kudos-api.selectorLabels" . | nindent 8 }}   # 8 = column under "labels:" + 2
```

Use `{{-` with `nindent` so the template line itself leaves no blank line behind.

## Hooks

```yaml
metadata:
  annotations:
    "helm.sh/hook": pre-upgrade,post-install
    "helm.sh/hook-weight": "0"                       # lower runs first
    "helm.sh/hook-delete-policy": before-hook-creation,hook-succeeded
```

Typical: a migration Job on `pre-upgrade` (and `post-install`, because on first install the chart's ConfigMap/Secret don't exist yet during `pre-install`). Hook resources aren't managed as part of the release; delete policies clean them up.

## Debugging a chart

```bash
helm template kudos-api ./chart --debug                 # show rendered output even when YAML is invalid
helm template kudos-api ./chart | kubectl apply --dry-run=server -f -   # server-side validation
helm install kudos-api ./chart --dry-run=server -n kudos-helm           # full install simulation (Helm 3.13+/4)
helm diff upgrade kudos-api ./chart -n kudos-helm      # needs the helm-diff plugin
```

Common errors:

| Error | Usual cause |
|---|---|
| `nil pointer evaluating interface {}.enabled` | `.Values.ingress.enabled` used but `ingress:` missing from values (or you're inside `with`/`range` where `.` changed) |
| `error converting YAML to JSON: yaml: line N: did not find expected key` | indentation: wrong `nindent`, missing `-` trim leaving content on the wrong line |
| `field is immutable` on upgrade | changed `spec.selector` (or a Job template); selectors must be stable |
| `invalid ownership metadata` | the object already exists and isn't managed by this release (applied with kubectl, or another release) |
