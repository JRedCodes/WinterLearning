# k8s/ (M6)

Put your Kubernetes manifests here (`*.yaml`, multi-document files are fine).
`api/test/m6-deploy.test.ts` parses every YAML file in this folder and expects:

- a **Deployment** whose name contains `api`: 2+ replicas, readiness probe on `/readyz`,
  liveness probe on `/healthz`, resource requests and limits, config from a ConfigMap
  **and** a Secret
- a **Service** whose name contains `api`, selecting exactly those pods
- a **Deployment** whose name contains `worker` (outbox relay, sweeper, notifications)
- a **Job** that runs the migrations

Modules 34 and 35 cover everything you need. Postgres/Redis/Kafka don't have to be
in here: say in DESIGN.md what you'd use in production (managed services or charts).
