# Domain spec & API contract

The product rules and the HTTP contract the acceptance tests check. When this document and a test disagree, the test wins (and please report it).

## Conventions

- JSON in, JSON out. Successful responses wrap the payload: `{ "data": ... }`.
- Errors: `{ "error": { "code": "SEAT_UNAVAILABLE", "message": "human text", "details": [...] } }`. `details` is optional; for `VALIDATION_ERROR` it is a list of `{ path, message }` where `path` is the field name (`"email"`, `"rows"`).
- Auth: `Authorization: Bearer <token>` from `POST /auth/login`.
- Times are ISO-8601 UTC strings (`"2030-06-01T19:00:00.000Z"`). "Now" always comes from the injected `Clock`.
- Ids are UUIDs. A malformed id in a path is treated like an unknown id (404), never a 500.
- Money is integer cents.

## Error codes

| Code | Status | When |
|---|---|---|
| `VALIDATION_ERROR` | 400 | Body/params fail validation; event start in the past; empty patch |
| `INVALID_JSON` | 400 | Malformed JSON body |
| `IDEMPOTENCY_KEY_REQUIRED` | 400 | `POST /bookings` without `Idempotency-Key` |
| `INVALID_CREDENTIALS` | 401 | Wrong email **or** password (same message for both) |
| `UNAUTHENTICATED` | 401 | Missing, unknown, expired or revoked token |
| `FORBIDDEN` | 403 | Customer on organizer endpoints; organizer on someone else's event |
| `NOT_FOUND` | 404 | Unknown event, hold or booking, **or one that belongs to someone else** |
| `SEAT_NOT_FOUND` | 404 | A requested seat label doesn't exist for that event |
| `ROUTE_NOT_FOUND` | 404 | No such route |
| `EMAIL_TAKEN` | 409 | Email already registered (case-insensitive) |
| `SEAT_UNAVAILABLE` | 409 | A requested seat is held (unexpired) or booked |
| `HOLD_EXPIRED` | 409 | Booking a hold whose `expiresAt` has passed |
| `HOLD_NOT_ACTIVE` | 409 | Booking or releasing a hold that is released or already converted |
| `IDEMPOTENCY_KEY_REUSED` | 422 | Same key, same user, different request body |
| `RATE_LIMITED` | 429 | Over a rate limit; includes `Retry-After` |
| `INTERNAL_ERROR` | 500 | Anything unexpected (generic message, details only in logs) |

## Users & auth (M1)

| Field | Rules |
|---|---|
| `email` | Trimmed, lower-cased, valid email, unique |
| `password` | 8–200 characters, stored only as a slow salted hash (scrypt, cost `PASSWORD_SCRYPT_N`) |
| `name` | Trimmed, 1–100 characters |
| `role` | `"organizer"` if the email is in `ORGANIZER_EMAILS`, else `"customer"`. Never taken from the request body |

- `POST /auth/register` `{ email, password, name }` → **201** `{ data: { id, email, name, role } }`. Never return the hash or anything containing "password".
- `POST /auth/login` `{ email, password }` → **200** `{ data: { token, user } }`. Rate-limited (see M3).
- `POST /auth/logout` (auth) → **204**. The token stops working immediately.
- `GET /me` (auth) → **200** `{ data: user }`.
- Tokens are opaque and server-side (Redis, TTL `SESSION_TTL_SECONDS`) so logout can revoke them.

## Events & seats (M1)

`POST /events` (organizer) `{ name, venue, startsAt, priceCents, rows, seatsPerRow }`

| Field | Rules |
|---|---|
| `name`, `venue` | Trimmed, 1–200 characters |
| `startsAt` | ISO datetime, strictly after now |
| `priceCents` | Integer ≥ 0 |
| `rows` | Integer 1–26 (rows are lettered A..Z) |
| `seatsPerRow` | Integer 1–50 (seats numbered from 1) |

→ **201**, `Location: /events/:id`, body:

```json
{ "data": { "id": "…", "name": "…", "venue": "…", "startsAt": "2030-06-01T19:00:00.000Z",
            "priceCents": 2500, "totalSeats": 10, "organizerId": "…" } }
```

Creating an event creates its seats: labels `A1…A{n}`, `B1…`, each `{ id: "A1", row: "A", number: 1 }`.

- `GET /events` → upcoming events only (`startsAt > now`), soonest first.
- `GET /events/:id` → the event, or 404.
- `PATCH /events/:id` (owning organizer) `{ name?, venue?, startsAt?, priceCents? }` → **200** updated event. At least one field. Seat grid can't change.
- `GET /events/:id/seats` → `{ data: { eventId, seats: [{ id, row, number, status }] } }`, ordered by row then number. `status` is `available | held | booked`; a held seat whose hold has expired reads as `available`.
- `GET /events/:id/sales` (owning organizer) → `{ data: { eventId, bookings, seatsSold, seatsHeld, seatsAvailable, revenueCents } }` where `seatsHeld` counts only unexpired holds.

## Holds (M2)

A hold reserves 1..`MAX_SEATS_PER_HOLD` seats of one event for one user, for `HOLD_TTL_SECONDS`.

- `POST /events/:id/holds` (auth) `{ seats: ["A1", "A2"] }` → **201**

  ```json
  { "data": { "id": "…", "eventId": "…", "seats": ["A1", "A2"], "expiresAt": "…", "status": "active" } }
  ```

  - `seats` in the response are sorted (`A1, A2, …, A10, B1`).
  - Validation: non-empty, at most `MAX_SEATS_PER_HOLD`, no duplicates → 400.
  - Unknown event → 404 `NOT_FOUND`. Any unknown seat → 404 `SEAT_NOT_FOUND`.
  - **All or nothing:** if any seat is booked or held by an unexpired hold → 409 `SEAT_UNAVAILABLE`, and no seat is held.
  - A seat whose hold expired is free to hold, even if no sweeper has run.
  - Rate-limited per user (see M3).
- `GET /holds/:id` (owner) → the hold. `status` is `active | released | converted | expired`; an active hold past `expiresAt` reads as `expired`. Other users get 404.
- `DELETE /holds/:id` (owner) → **204**; seats become available, status `released`. Not active → 409 `HOLD_NOT_ACTIVE`. Other users → 404.

## Bookings (M2)

- `POST /bookings` (auth), header `Idempotency-Key: <1–200 chars>`, body `{ holdId }` → **201**, `Location: /bookings/:id`

  ```json
  { "data": { "id": "…", "eventId": "…", "holdId": "…", "seats": ["A1", "A2"],
              "totalCents": 5000, "status": "confirmed", "createdAt": "…" } }
  ```

  - `totalCents = event.priceCents × seats` at booking time.
  - Hold not found or not yours → 404. Released/converted → 409 `HOLD_NOT_ACTIVE`. Expired → 409 `HOLD_EXPIRED`.
  - On success: seats `booked`, hold `converted`, and a `booking.confirmed` event is written to the outbox **in the same transaction**.
- **Idempotency** (keys are scoped per user):
  - same user + same key + same body → replay the stored 201 response, identical body, header `Idempotent-Replayed: true`, no new booking
  - same user + same key + different body → 422 `IDEMPOTENCY_KEY_REUSED`
  - concurrent requests with the same key → all get the same booking
  - a failed request (4xx) doesn't consume the key
- `GET /bookings` (auth) → the caller's bookings, oldest first. `GET /bookings/:id` → owner only, else 404.

## Caching & rate limits (M3)

- `GET /events/:id` and `GET /events` are cache-aside in Redis and set `X-Cache: HIT | MISS`. Creating or updating an event invalidates what it affects. The cached list must still hide events that have started since it was cached.
- Seat maps are never cached.
- Every Redis key (cache, sessions, limits, channels, BullMQ) starts with `REDIS_KEY_PREFIX` (`wl:36:`).
- Rate limits use a fixed window computed from the injected clock. Every limited response carries `RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset`; a blocked request is 429 `RATE_LIMITED` with `Retry-After` (seconds).
  - login: `LOGIN_RATE_LIMIT` attempts per `LOGIN_RATE_WINDOW_SECONDS`, keyed by client IP + email; every attempt counts.
  - holds: `HOLD_RATE_LIMIT` attempts per `HOLD_RATE_WINDOW_SECONDS`, keyed by user; failed attempts count.

## Events on the stream (M4)

Envelope (`DomainEvent`, given in `api/src/messaging/eventPublisher.ts`):

```json
{ "id": "uuid", "type": "booking.confirmed", "version": 1, "key": "<event (show) id>",
  "occurredAt": "<clock time of the booking>",
  "payload": { "bookingId": "…", "eventId": "…", "eventName": "…", "userId": "…",
               "userEmail": "…", "seats": ["A1", "A2"], "totalCents": 5000 } }
```

- The request path never calls the `EventPublisher`. The outbox relay does: `container.outboxRelay.runOnce()` publishes one batch (`OUTBOX_BATCH_SIZE`) in outbox order and returns `{ published, failed }`. Failed batches stay pending. Concurrent relays never publish the same event twice.
- `container.notifications.handle(event)` enqueues a confirmation email for `booking.confirmed` (ignores other types), idempotent per event id. `startWorker()` processes the queue with up to `NOTIFY_MAX_ATTEMPTS` attempts and exponential backoff from `NOTIFY_BACKOFF_MS`. The email goes to `userEmail`, its subject contains the event name, its text lists the seats.

## Realtime (M5)

`GET /events/:id/seats/stream` → `text/event-stream` (404 for unknown events):

```
event: snapshot
data: {"eventId":"…","seats":[{"id":"A1","row":"A","number":1,"status":"available"}, …]}

event: seats
data: {"eventId":"…","changes":[{"id":"A1","status":"held"},{"id":"A2","status":"held"}]}
```

- One `seats` message per operation (hold, booking, release, sweep), with absolute statuses.
- Works across app instances (Redis pub/sub).
- `container.holdSweeper.runOnce()` marks due holds `expired`, frees their seats, broadcasts the changes and returns the number of seats freed.

## Operations (M6)

- `GET /healthz` → 200 `{ status: "ok" }` without touching dependencies.
- `GET /readyz` → 200 `{ status: "ready", ... }` when Postgres and Redis answer, 503 otherwise.
- `GET /metrics` → Prometheus text including `http_request_duration_seconds` labelled by route **template** (`/events/:id`).
