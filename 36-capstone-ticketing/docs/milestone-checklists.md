# Milestone checklists

Tick these off as you go. "Tests green" is necessary but not sufficient: each list also has the things no test checks but a reviewer would. Before moving on, commit and push.

## M1 · Core API + auth (~6h)

**Before coding**
- [ ] Read `docs/domain-spec.md` fully. Sketch the tables for users, events and seats.
- [ ] Decide your folder layout (see `docs/architecture.md`) and write ADR-002 (sessions vs JWT) in `DECISIONS.md`.

**Walking skeleton**
- [ ] `buildContainer()` returns an object; M4/M5 members can be stubs that throw `new Error("M4")` for now.
- [ ] `createApp()` with `GET /healthz`, a JSON 404 and a central error handler.
- [ ] `001_init.sql` with `users`; `POST /auth/register` through controller → service → repository.
- [ ] `npx vitest api/test/m1-auth.test.ts` partly green.

**Feature complete**
- [ ] scrypt hashing with `config.auth.scryptN`; login with the same error for unknown email and wrong password.
- [ ] Redis-backed opaque tokens; `authenticate` middleware; logout revokes.
- [ ] `/readyz` checks Postgres and Redis.
- [ ] Events + seat grid created in one transaction (one set-based insert, not N inserts).
- [ ] Organizer-only routes, ownership check on PATCH.
- [ ] `m1-auth` and `m1-events` green; `npm run typecheck` clean.

**Reviewer checks**
- [ ] No `process.env` outside `config.ts`; no Express imports in services or repositories.
- [ ] Validation happens once, at the edge; services receive typed input.
- [ ] No SQL built with string concatenation of user input.

## M2 · Holds & bookings (~7h)

**Before coding**
- [ ] Draw the seat and hold state machines. List every race (see `docs/architecture.md` §5).
- [ ] Write ADR-001 (how you prevent double booking). Decide: row locks vs conditional update.

**Holds**
- [ ] Seat rows locked in a fixed order inside one transaction; all-or-nothing.
- [ ] Expiry uses the injected clock everywhere (seat map, new holds, bookings). No SQL `now()` for business rules.
- [ ] `GET /holds/:id` shows `expired` for active holds past expiry; `DELETE` releases.

**Bookings**
- [ ] `idempotency_keys` claimed inside the booking transaction; response stored in the same transaction.
- [ ] Hold row locked; status and expiry re-checked under the lock.
- [ ] `bookings.hold_id UNIQUE` (or equivalent) as a database backstop.
- [ ] `GET /events/:id/sales` with counts computed in SQL.
- [ ] `m2-*` green, and green **five runs in a row** (flaky concurrency tests are real bugs).

**Reviewer checks**
- [ ] Transactions contain only Postgres work: no Redis, no HTTP, no publishing inside them.
- [ ] Connections are always released (use a `withTransaction` helper with `finally`).
- [ ] Someone else's hold/booking returns 404, not 403 (don't leak existence).

## M3 · Caching & rate limiting (~3h)

- [ ] Cache-aside for `GET /events/:id` and `GET /events`, `X-Cache` header, TTL with jitter.
- [ ] Invalidate after the database write (create + update); "already started" filter applied after reading the cache.
- [ ] Seat maps never cached (`Cache-Control: no-store` is a nice touch).
- [ ] Fixed-window limiter in Redis, window from the injected clock, atomic (MULTI or Lua).
- [ ] Login limited by IP + email; holds limited by user; headers + `Retry-After`.
- [ ] Every key under `wl:36:`. `m3-*` green.
- [ ] Decide and document: does your limiter fail open or closed when Redis is down? (ADR)

## M4 · Events & notifications (~5h)

- [ ] `outbox` table; the booking transaction appends `booking.confirmed`.
- [ ] `OutboxRelay.runOnce()`: lock batch with `SKIP LOCKED` → publish via `EventPublisher` → mark published / record failure.
- [ ] `NotificationService`: `handle()` enqueues with job id = event id; `startWorker()` sends with retries/backoff; BullMQ `prefix` under `wl:36:`.
- [ ] `KafkaEventPublisher` (kafkajs, key = event id) and a consumer helper.
- [ ] `api/src/worker.ts`: relay loop, sweeper loop (M5), consumer, email worker, graceful shutdown.
- [ ] `m4-*` green. Optional: `make up` and run the worker against real Kafka; watch `make kafka-topics`.
- [ ] Write ADR-004 (outbox vs alternatives).

## M5 · Realtime seat map (~4h)

- [ ] `SeatUpdates` port with a Redis pub/sub implementation (one subscriber connection per process).
- [ ] Services publish changes **after commit**, best effort (log and continue on failure).
- [ ] SSE endpoint: 404 check → headers → subscribe → snapshot → flush early changes → heartbeat → cleanup on `res.on("close")`.
- [ ] `holdSweeper.runOnce()` expires due holds, frees seats, broadcasts per event.
- [ ] `container.close()` closes the subscriber connection and the queue.
- [ ] `m5-realtime` green. Write ADR-003 (SSE vs WebSockets).

## M6 · Ship it (~4h)

- [ ] `/metrics` with an HTTP duration histogram labelled by route template.
- [ ] Structured logs (pino) with request ids; no secrets or tokens in logs.
- [ ] `api/Dockerfile`: multi-stage, prod deps only, non-root `USER`, exec-form `CMD`.
- [ ] Graceful shutdown closes SSE streams, then the pool and Redis.
- [ ] `k8s/`: namespace, ConfigMap, Secret (example), migration Job, api Deployment (probes, resources, 2+ replicas, `maxUnavailable: 0`) + Service, worker Deployment. Optional: PDB, HPA, Ingress with SSE annotations.
- [ ] `m6-deploy` green. Optional: run it on kind (module 34's runbook).

## M7 · Frontend (~4h)

- [ ] Vite + React + TS in `web/` with its own `package.json`.
- [ ] One API client module (fetch wrapper with error mapping); components never call `fetch`.
- [ ] Login, events list, live seat map via `EventSource` (snapshot + changes).
- [ ] Pick seats → hold → countdown → book; Idempotency-Key generated **once per hold** and reused on retry.
- [ ] Loading, error and empty states; accessible seat buttons (labels, disabled states).
- [ ] Optional: a couple of Testing Library tests (module R1/R2 style).

## M8 · Design doc (~2h)

- [ ] `DESIGN.md`: all eight sections with real content and at least one mermaid diagram.
- [ ] `DECISIONS.md`: at least three ADRs (Context / Options considered / Decision / Consequences).
- [ ] Failure modes table: Postgres, Redis, Kafka, email provider, pod crash mid-request.
- [ ] Read it aloud in 5 minutes. Could a stranger understand how a booking flows?
- [ ] `m8-docs` green, then answer `INTERVIEW.md`.
