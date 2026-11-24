# Deploy plan

<!--
A plan for running the capstone publicly as a portfolio demo. You don't have to execute it to pass,
but write it as if you will (and ideally do!). Keep platform details general and check current
docs and pricing pages yourself; they change often. See docs/deployment-options.md.
-->

## Target platform

<!-- Which option (PaaS, a small VPS with Docker + a reverse proxy, managed Kubernetes...) and WHY.
Name at least one alternative you rejected and the reason. -->

TODO

## Architecture

<!-- Mermaid diagram of the DEPLOYED system: DNS, TLS/proxy, app instances, worker, data stores. -->

TODO

## Data stores

<!-- Postgres, Redis, Kafka: managed or self-run? Where do backups go and how would you restore?
If Kafka is too heavy for a demo, what do you do instead (and how does your design allow it)? -->

TODO

## Secrets & configuration

<!-- Where secrets live, how they reach the app, what is NOT in git, how you'd rotate one. -->

TODO

## Domain & TLS

<!-- Domain or platform subdomain, DNS records, how certificates are issued and renewed. -->

TODO

## CI/CD

<!-- What happens from git push to live: tests, image build, tag, migrations (when and how), deploy. -->

TODO

## Observability

<!-- Logs, metrics, health checks, uptime monitoring, alerts: what's the minimum for a demo? -->

TODO

## Cost & limits

<!-- Budget ceiling and alerts, what scales to zero, how you stop abuse of a public demo
(rate limits, demo accounts, no real personal data). Don't quote prices from memory. -->

TODO

## Rollback plan

<!-- How you go back to the previous version in minutes, and what you do about migrations. -->

TODO

## Launch checklist

<!-- 6+ checklist items, written as "- [ ] item". -->

- [ ] TODO
