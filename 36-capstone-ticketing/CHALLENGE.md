# Challenge · Event Ticketing Platform

**Type:** 🛠️ Build · **Est:** 30–40h over several sessions · **Services:** Postgres, Redis, Kafka

## Scenario

> **#proj-tickets** · *Dana (Head of Engineering):* We're replacing the ticketing vendor before the summer tour season. Last year their system sold the same front-row seat to three people at the Arena on-sale, and their "your order may or may not have gone through, please don't retry" page went viral for the wrong reasons. 😬
>
> I want our own platform, built properly: fans hold seats for ten minutes, book them, get an email, and watch the seat map update live. Organizers create shows and see sales. It has to survive an on-sale spike, and **nobody ever gets double-booked or double-charged**. I've written the contract and acceptance tests for the backend milestones; the frontend, deployment and design doc are yours to shape. Ship it in milestones and demo each one to me. 🎟️

## Your task

Build the system in eight milestones, in order. Each ends in something working, tested and committed. The exact contract is in [docs/domain-spec.md](docs/domain-spec.md); where code goes is up to you ([docs/architecture.md](docs/architecture.md) shows one clean layout). Per-milestone checklists: [docs/milestone-checklists.md](docs/milestone-checklists.md).

What you're given in `challenge/`:

| Path | |
|---|---|
| `package.json`, `tsconfig.json`, `vitest.config.ts`, `Makefile`, `docker-compose.yml`, `.env.example` | project setup: one package at `challenge/`, source under `api/` |
| `api/src/config.ts` | complete typed config (the only reader of `process.env`) |
| `api/src/container.ts` | the **composition contract**: `ContainerDeps`, the `Container` members the tests use, a `buildContainer()` stub |
| `api/src/app.ts` | `createApp()` stub |
| `api/src/server.ts` | API composition root (complete) |
| `api/src/lib/clock.ts`, `api/src/messaging/eventPublisher.ts`, `api/src/notifications/emailSender.ts` | the ports: `Clock`, `EventPublisher` + `DomainEvent`, `EmailSender` |
| `api/src/db/` | pool + migration runner (complete); `api/migrations/001_init.sql` is an empty placeholder |
| `api/test/` | acceptance tests per milestone, helpers, fakes. **Don't edit.** |
| `DESIGN.md`, `DECISIONS.md` | templates (M8; start DECISIONS.md in M1) |
| `web/README.md`, `k8s/README.md` | placeholders for M7 and M6 |

### M1 · Core API + auth
Schema for users/events/seats. `buildContainer()` and `createApp()` with a layered structure. Health and readiness probes. Register, login (opaque Redis-backed bearer tokens), logout, `/me`. Organizers create and edit events, which generates the seat grid. Public event list, event details and seat map. Central error handling with the error codes from the spec.
*Tip:* stub the M4/M5 container members (`outboxRelay`, `holdSweeper`, `notifications`) with functions that throw until you get there.

### M2 · Seat holds & bookings
Race-free, all-or-nothing holds with expiry from the injected clock. Release. Bookings that require an `Idempotency-Key`, replay on retry and reject key reuse. Owner-only reads. Organizer sales summary. The concurrency tests must be green reliably.

### M3 · Caching & rate limiting
Cache-aside for event reads with `X-Cache`, invalidation on writes, no caching of availability. Fixed-window rate limits for login (IP + email) and holds (per user) with standard headers. Every Redis key under `wl:36:`.

### M4 · Events & notifications
Transactional outbox written in the booking transaction. `outboxRelay.runOnce()` publishing through the `EventPublisher` port with `SKIP LOCKED`. Notifications consumer that enqueues idempotent BullMQ jobs and a worker that sends emails with retries. A Kafka adapter and `api/src/worker.ts` that runs the relay, the consumer and the email worker.

### M5 · Realtime seat map
SSE stream (`snapshot` then `seats` changes) fanned out across instances with Redis pub/sub. `holdSweeper.runOnce()` that expires holds and broadcasts freed seats (run it on an interval in `worker.ts`).

### M6 · Observability & deployment
`/metrics` (route-template labels), structured logs, `api/Dockerfile` (multi-stage, non-root), graceful shutdown that also closes SSE streams, Kubernetes manifests in `k8s/`.

### M7 · Frontend
React app in `web/` (own `package.json`): login, events, live seat map, hold → countdown → book with an idempotency key per hold. Not part of `npm test`.

### M8 · Design doc
`DESIGN.md` (Requirements, Estimates, API, Data Model, High-Level Design with a mermaid diagram, Deep Dives, Trade-offs, Failure Modes) and at least three ADRs in `DECISIONS.md`.

## Acceptance criteria

Every box maps to a test file in `challenge/api/test/` (except M7).

**M1** (`m1-auth.test.ts`, `m1-events.test.ts`)
- [ ] `/healthz` 200 `{status:"ok"}`; `/readyz` 200 when Postgres and Redis answer
- [ ] Register normalizes email, assigns role from `ORGANIZER_EMAILS`, never returns password material; 400 with field `details`; 409 `EMAIL_TAKEN` (case-insensitive)
- [ ] Login returns a token; `/me` works with it; identical 401 `INVALID_CREDENTIALS` for unknown email and wrong password; 401 `UNAUTHENTICATED` without a valid token; logout revokes immediately
- [ ] JSON 404 `ROUTE_NOT_FOUND`; 400 `INVALID_JSON`
- [ ] Organizers create events (201 + `Location`, seat grid generated); customers 403, anonymous 401; validation details; start time must be in the future (by the clock)
- [ ] Event details, 404 for unknown/malformed ids; upcoming list soonest first, hiding started events; seat map ordered and all available
- [ ] PATCH by owning organizer only; empty patch 400

**M2** (`m2-holds.test.ts`, `m2-bookings.test.ts`, `m2-concurrency.test.ts`)
- [ ] Holds: sorted seats, `expiresAt` = clock + TTL, all-or-nothing 409 `SEAT_UNAVAILABLE`, 404 `SEAT_NOT_FOUND`, validation, auth required
- [ ] Expired holds free their seats without any background job; hold status reads `expired`
- [ ] Release: 204, seats free, 404 for others, 409 `HOLD_NOT_ACTIVE` when already released
- [ ] Booking: 201 with total, seats booked, hold converted; 400 without key; replay with `Idempotent-Replayed: true`; 422 on key reuse; keys per user; 409 `HOLD_EXPIRED` / `HOLD_NOT_ACTIVE`; 404 for others' holds; booked seats can't be held again
- [ ] Owner-only booking reads; organizer sales summary (403 for customers)
- [ ] **50 fans racing for one seat → exactly 1 booking**; 50 bookings of one hold → exactly one 201; 20 same-key retries → one booking; overlapping multi-seat holds never deadlock

**M3** (`m3-cache.test.ts`, `m3-rate-limit.test.ts`)
- [ ] `X-Cache` MISS then HIT on event details and list; invalidation on create/update; cached list still hides started events; seat map always fresh; every Redis key starts with `wl:36:`
- [ ] Login limit per IP + email with `RateLimit-*` and `Retry-After`, reset after the window (by the clock); hold limit per user, failed attempts counted

**M4** (`m4-outbox.test.ts`, `m4-notifications.test.ts`)
- [ ] Bookings never call the publisher; the relay publishes the exact `booking.confirmed` envelope once, in commit order
- [ ] Broker outage: bookings still succeed, relay reports `failed`, nothing lost after recovery; concurrent relays never duplicate; failed bookings leave no event
- [ ] One email per event even when delivered twice; other event types ignored; retries until the provider recovers; end-to-end booking → email

**M5** (`m5-realtime.test.ts`)
- [ ] SSE snapshot, then changes for hold/book/release, only for the requested event, across two app instances
- [ ] Sweeper frees expired holds, broadcasts, returns the count, is idempotent; 404 for unknown events

**M6** (`m6-deploy.test.ts`)
- [ ] `/metrics` with `http_request_duration_seconds` labelled `route="/events/:id"` (no raw ids)
- [ ] Multi-stage Dockerfile with non-root `USER`; k8s api Deployment (2+ replicas, `/readyz` + `/healthz` probes, resources, ConfigMap + Secret), matching Service, worker Deployment, migration Job

**M7** (manual)
- [ ] The frontend runs against your API and shows a live seat map; holding and booking work end to end

**M8** (`m8-docs.test.ts`)
- [ ] DESIGN.md sections filled (60+ words each, mermaid in High-Level Design); 3+ complete ADRs

- [ ] `npm test` and `npm run typecheck` pass in `challenge/`

## Getting started

```bash
cd 36-capstone-ticketing/challenge
make install
make up                               # postgres :5433, redis :6380, kafka :9092
make test                             # everything fails with "Not implemented": that's your starting line
npx vitest api/test/m1-auth.test.ts   # work one file at a time, in watch mode
make dev                              # the API on :3000 once M1 works
```

Try the API by hand as you go:

```bash
curl -s localhost:3000/auth/register -H 'content-type: application/json' \
  -d '{"email":"organizer@example.com","password":"password123","name":"Olive"}'
TOKEN=$(curl -s localhost:3000/auth/login -H 'content-type: application/json' \
  -d '{"email":"organizer@example.com","password":"password123"}' | jq -r .data.token)
curl -s localhost:3000/events -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"name":"Synth Night","venue":"Warehouse","startsAt":"2030-06-01T19:00:00Z","priceCents":2500,"rows":3,"seatsPerRow":8}'
curl -N localhost:3000/events/<id>/seats/stream      # leave it open, hold seats in another terminal
```

(Start the API with `ORGANIZER_EMAILS=organizer@example.com make dev` so that account becomes an organizer. `.env.example` documents every variable.)

## Rules

- Don't modify the tests or the given ports (`Clock`, `EventPublisher`, `EmailSender`). You may add your own tests, and add fields to `Config`.
- Layered architecture throughout: no Express in services/repositories, no `process.env` outside `config.ts`, concrete classes chosen only in `container.ts`.
- No ORM. `pg` (or Kysely as a query builder) is fine.
- Business time comes from the injected `Clock`, never `new Date()` or SQL `now()`.
- The request path never talks to Kafka or the email provider.
- Keep `DECISIONS.md` up to date from M1 on, not just at the end.

## Stretch goals

1. **Cancellations:** `POST /bookings/:id/cancel` frees the seats and emits `booking.cancelled` through the outbox (and a cancellation email).
2. **Payment step:** hold → `POST /holds/:id/payment-intent` → a fake payment webhook (idempotent!) confirms the booking.
3. **Dead-letter handling:** permanently failed notification jobs go to a DLQ queue with an admin endpoint to replay them; outbox rows with many failed attempts raise an alert metric.
4. **Outbox lag metric:** a gauge for the age of the oldest unpublished outbox row, scraped from `/metrics`.
5. **Change coalescing:** batch seat changes per event into 100ms windows before broadcasting, and measure the difference with k6 (module 29).
6. **Helm chart** for `k8s/` with values per environment (module 35).
7. **Load test** the on-sale with k6: 500 virtual users on one event. Record p95 latency and zero oversells in DESIGN.md.
8. **Frontend tests** with Testing Library: the seat map applies `seats` changes; "Book" reuses the same key on retry.

## Done?

1. `npm test` is green and `npm run typecheck` is clean in `challenge/`; the web app runs.
2. Commit on your branch `module/36-capstone-ticketing`, push and open a PR. CI runs this module's tests. Ask Claude to review it like a senior engineer would: the design, not just the code.
3. From the repo root: `npm run progress -- 36` to tick it off on the roadmap.
4. Answer the questions in [INTERVIEW.md](INTERVIEW.md). They're about **your** design.
5. Add an entry to [LOG.md](../LOG.md): what was hardest, what you'd redo.
6. Compare with the reference solution: `git diff main origin/solutions -- 36-capstone-ticketing/` (and read `SOLUTION.md` on that branch).
7. Then module [37 · Portfolio](../37-portfolio/README.md): turn this into resume bullets and a public project.

Stuck? → [HINTS.md](HINTS.md)
