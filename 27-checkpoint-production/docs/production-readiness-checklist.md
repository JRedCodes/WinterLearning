# Production readiness checklist

A reusable checklist for any HTTP service. The items in **bold** are covered by this module's tests. The rest are what a real launch review adds on top.

## Security

- [ ] **Authentication on every non-public route** (explicit guard, public by exception)
- [ ] **Passwords hashed with a slow, salted KDF** (scrypt, argon2id, bcrypt), with bounded input length
- [ ] **Session ids from a CSPRNG, ≥128 bits**, stored server-side with a TTL
- [ ] **Cookies `HttpOnly`, `SameSite=Lax` (or Strict), `Secure` in production**
- [ ] **Session rotated on login**, destroyed on logout
- [ ] **Ownership enforced in data access; 404 for resources you don't own**
- [ ] **No user enumeration** (same response for unknown user and wrong password)
- [ ] **Unknown body fields ignored** (no mass assignment)
- [ ] **Security headers** (helmet: CSP, HSTS, nosniff, frame options), `x-powered-by` off
- [ ] CORS allowlist if browsers on other origins call the API ([module 25](../../25-security/README.md))
- [ ] Secrets from the environment or a secret manager, never in the repo or the image
- [ ] Dependencies audited in CI (`npm audit`, Dependabot or Renovate)
- [ ] DB user has least privilege (no superuser for the app)

## Abuse resistance

- [ ] **Login rate limited, shared across instances**, with `429` + `Retry-After`
- [ ] **Body size limit**, **max lengths on every string field**
- [ ] Per-user or per-API-key limits on expensive endpoints
- [ ] Timeouts on outgoing calls (DB statement timeout, fetch with AbortSignal)

## Correctness at the edges

- [ ] **Every input validated** (body, query, **route params**)
- [ ] **Consistent error shape with machine-readable codes and a request id**
- [ ] **Generic 500s**, details only in logs
- [ ] Idempotency for retried writes where clients retry ([module 15](../../15-transactions-concurrency/README.md), [23](../../23-api-design/README.md))

## Observability

- [ ] **Structured JSON logs to stdout, one line per request, with a request id**
- [ ] **Secrets redacted / never logged**
- [ ] **RED metrics with bounded label cardinality**
- [ ] **Liveness and readiness endpoints with the right semantics**
- [ ] Dashboards for the RED metrics and saturation (pool usage, event loop lag)
- [ ] Alerts on SLO burn rate, not on every error
- [ ] Tracing with context propagation across services

## Operability

- [ ] **Graceful shutdown: drain, deadline, close resources in order**
- [ ] **Config parsed and validated once at startup (fail fast)**
- [ ] Migrations run as a separate deploy step, backward compatible (expand/contract)
- [ ] Runbook: how to deploy, roll back, rotate secrets, what each alert means
- [ ] Backups tested by actually restoring them

## Delivery

- [ ] **Multi-stage, non-root, minimal image built with `npm ci`**, with a HEALTHCHECK and exec-form CMD
- [ ] CI runs lint, typecheck and tests on every PR. Image tagged with the commit SHA
- [ ] Image scanned. Base image pinned and updated by a bot
- [ ] Rollback = redeploy the previous SHA, practiced at least once

## Documentation

- [ ] **Decision records for the non-obvious choices**
- [ ] API contract (OpenAPI) kept in sync ([module 23](../../23-api-design/README.md))
- [ ] README: how to run locally, how to test, where the dashboards are
