# Decision record · How do we package kudos-api for several environments?

<!--
We'll soon run kudos-api in dev (kind), staging and production. Each needs slightly different
values: replicas/HPA bounds, resources, hostnames, DB host, image tag. You've now written the
same app as raw manifests (broken/) and as a Helm chart (chart/). Write a short ADR.
Each section needs at least 20 words of your own.
-->

## Context

<!-- What differs between environments? Who changes it and how often? How do changes get
to the cluster today (kubectl apply from a laptop)? -->

## Options considered

<!-- At least: (a) raw manifests copied per environment, (b) Kustomize base + overlays,
(c) a Helm chart with per-environment values files. Optionally (d) GitOps (Argo CD / Flux)
on top of b or c. One or two pros and cons each. -->

## Decision

<!-- What you'd pick for this team and why. -->

## Consequences

<!-- What gets easier, what gets harder, what new things you need (chart versioning,
values review, drift detection, secrets handling...). -->
