{{/*
Named templates shared by every manifest in this chart. Provided: read them, then use them.

  include "kudos-api.fullname" .        -> object names (release-aware, max 63 chars)
  include "kudos-api.labels" .          -> full label set for metadata.labels
  include "kudos-api.selectorLabels" .  -> the small, STABLE subset used in selectors
*/}}

{{- define "kudos-api.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Fully qualified app name. If the release name already contains the chart name
(e.g. `helm install kudos-api ./chart`), use it as is; otherwise "<release>-<chart>".
*/}}
{{- define "kudos-api.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{- define "kudos-api.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Selector labels: never put anything here that changes between releases (like the chart
version), because a Deployment's selector is immutable.
*/}}
{{- define "kudos-api.selectorLabels" -}}
app.kubernetes.io/name: {{ include "kudos-api.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{- define "kudos-api.labels" -}}
helm.sh/chart: {{ include "kudos-api.chart" . }}
{{ include "kudos-api.selectorLabels" . }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}
