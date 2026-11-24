# Hints · Event Ticketing Platform

Open one hint at a time, and give each a real try first. They're grouped by milestone. For the bigger picture, re-read [docs/architecture.md](docs/architecture.md).

## Getting unstuck in general

<details><summary>Hint 1: Everything fails with "Not implemented"</summary>

That's expected: every test file builds the app through `buildContainer()` + `createApp()` in `beforeAll`. Make both return *something* first: a container with stubbed members and an app with only `/healthz`. Then you'll see real, per-test failures.
</details>

<details><summary>Hint 2: I don't know where to put things</summary>

Ask "what does this code know about?" Knows Express (`req`, `res`, status codes) → controller/middleware. Knows business rules ("a hold is all-or-nothing") → service or `domain/`. Knows SQL or Redis commands → repository/adapter. Knows which class implements which interface → `container.ts`.
</details>

## M1 · Core API + auth

<details><summary>Hint 1: Auth shape</summary>

Three pieces: a password hasher (scrypt from `node:crypto`, see module 22), a session store (random token → user id in Redis with a TTL), and an `authenticate` middleware that turns `Authorization: Bearer x` into `res.locals.actor`. A separate `requireAuth` middleware throws `UnauthenticatedError` on routes that need a user.
</details>

<details><summary>Hint 2: Same error for unknown email and wrong password</summary>

Throw the same `InvalidCredentialsError` in both branches. To avoid a timing difference, run a password verification against a dummy hash when the user doesn't exist, so both paths cost one scrypt.
</details>

<details><summary>Hint 3: Generating the seat grid</summary>

One statement, inside the same transaction as the event insert:

```sql
INSERT INTO seats (event_id, label, row_label, seat_number)
SELECT $1, chr(64 + r) || n, chr(64 + r), n
FROM generate_series(1, $2::int) AS r, generate_series(1, $3::int) AS n
```

`chr(65)` is `A`. Order the seat map by `row_label, seat_number` (ordering by `label` would put `A10` before `A2`).
</details>

<details><summary>Hint 4: "Hides events that have already started"</summary>

`WHERE starts_at > $1` with `$1 = clock.now()`. Pass the clock's time as a parameter; don't use SQL `now()`.
</details>

## M2 · Holds & bookings

<details><summary>Hint 1: Seat status vs hold status</summary>

Store both: seats have `status` (`available`/`held`/`booked`) plus `hold_id` and `held_until`; holds have their own status and `expires_at`. "Expired" doesn't need to be written anywhere for correctness: a held seat with `held_until <= now` *counts as* available in every query that cares.
</details>

<details><summary>Hint 2: The race</summary>

Two transactions both reading "A5 is available" and both writing "held" is the oversell. You need the second one to wait and then see the first one's write. In Postgres that's a row lock: `SELECT ... FOR UPDATE` on the seat rows at the start of the hold transaction. Under READ COMMITTED, a transaction that waited for a lock reads the *new* row version once it gets it.
</details>

<details><summary>Hint 3: Holding several seats without deadlocks</summary>

```text
BEGIN
  check event exists (404)
  rows = SELECT label, status, held_until FROM seats
         WHERE event_id = $1 AND label = ANY($2) ORDER BY label FOR UPDATE
  if rows.length < requested         -> SeatNotFound(missing labels)
  taken = rows where booked, or held with held_until > now
  if taken                            -> SeatUnavailable(taken)
  INSERT hold; UPDATE seats SET status='held', hold_id, held_until
COMMIT
```

The `ORDER BY label` is what prevents deadlocks between overlapping requests.
</details>

<details><summary>Hint 4: Idempotency keys that survive concurrency</summary>

Don't "check if the key exists, then insert": two concurrent retries would both see "no key". Make the insert itself the check, inside the booking transaction:

```sql
INSERT INTO idempotency_keys (user_id, key, request_hash, created_at)
VALUES (...) ON CONFLICT (user_id, key) DO NOTHING
```

If it inserted a row, you own the key: do the booking and, before COMMIT, `UPDATE idempotency_keys SET response_status, response_body`. If it inserted nothing, another transaction already committed that key: read it, compare the request hash (422 if different) and return the stored body. While another transaction holds an uncommitted claim, your INSERT simply waits.
</details>

<details><summary>Hint 5: Booking the same hold 50 times at once</summary>

Lock the hold row (`SELECT ... FROM holds WHERE id = $1 AND user_id = $2 FOR UPDATE`) right after claiming the key, then check its status and expiry. The first transaction converts it; the 49 that waited see `converted` and fail with `HOLD_NOT_ACTIVE`. A `UNIQUE` constraint on `bookings.hold_id` is a cheap safety net.
</details>

## M3 · Caching & rate limiting

<details><summary>Hint 1: Where does X-Cache come from?</summary>

The cache layer knows whether it hit. Have it return `{ value, hit }`, let the service pass that up (e.g. `{ value, cache: "HIT" | "MISS" }`) and the controller set the header. The service still doesn't know about HTTP; it just reports where the data came from.
</details>

<details><summary>Hint 2: The cached list and the clock</summary>

Cache the result of the query, then filter `startsAt > now` on every read, after the cache. Time only moves forward, so filtering a slightly old list is always correct.
</details>

<details><summary>Hint 3: A fixed window you can test</summary>

```text
windowMs    = windowSeconds * 1000
windowStart = floor(clock.now() / windowMs) * windowMs
key         = prefix + "rl:" + name + ":" + id + ":" + windowStart
count       = MULTI INCR key; PEXPIRE key (2 * windowMs) EXEC
allowed     = count <= limit
retryAfter  = ceil((windowStart + windowMs - now) / 1000)
```

Because the window comes from the injected clock, `clock.advance(60_000)` lands in a new key.
</details>

<details><summary>Hint 4: A key outside wl:36:</summary>

Usually BullMQ (pass `prefix: "wl:36:bull"` to both `Queue` and `Worker`) or a pub/sub channel name. List them with `redis-cli -p 6380 -n 4 --scan`.
</details>

## M4 · Events & notifications

<details><summary>Hint 1: What goes in the outbox row</summary>

Everything needed to rebuild the `DomainEvent`: event id (uuid), type, version, key, payload (jsonb), occurredAt. Plus bookkeeping: an identity `id` for ordering, `published_at`, `attempts`, `last_error`. Insert it with the same transaction client as the booking.
</details>

<details><summary>Hint 2: The relay, one run</summary>

```text
BEGIN
  rows = SELECT ... FROM outbox WHERE published_at IS NULL
         ORDER BY id LIMIT batchSize FOR UPDATE SKIP LOCKED
  if none: COMMIT, return {0, 0}
  try   publisher.publish(events) ; UPDATE ... published_at = now  -> {n, 0}
  catch UPDATE ... attempts + 1, last_error                          -> {0, n}
COMMIT
```

`SKIP LOCKED` is what lets three relays run at once without publishing the same row: each one skips rows another relay has locked.
</details>

<details><summary>Hint 3: Idempotent notifications for free</summary>

`queue.add(name, data, { jobId: event.id })`: BullMQ ignores an add whose job id already exists. Keep completed jobs for a while (`removeOnComplete: { age, count }`, not `true`), or the de-duplication window disappears. Retries: `attempts` + `backoff: { type: "exponential", delay }` in the default job options.
</details>

<details><summary>Hint 4: BullMQ connections</summary>

Give BullMQ connection *options* (`{ host, port, db }` parsed from `REDIS_URL`), not your ioredis instance: workers need their own blocking connection. Close the `Queue` in `container.close()` and the `Worker` in the object `startWorker()` returns.
</details>

## M5 · Realtime

<details><summary>Hint 1: SSE in Express</summary>

`res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" })`, `res.flushHeaders()`, then `res.write("event: snapshot\ndata: " + JSON.stringify(x) + "\n\n")`. Clean up in `res.on("close", ...)`. (`req.on("close")` fires as soon as the request body is read in modern Node, which for a GET is immediately.)
</details>

<details><summary>Hint 2: Missing the first change</summary>

If you send the snapshot and *then* subscribe, a change in between is lost. Subscribe first (await the SUBSCRIBE), buffer messages, read and send the snapshot, then flush the buffer. Absolute statuses make a duplicate harmless.
</details>

<details><summary>Hint 3: Pub/sub connections</summary>

A Redis connection in subscriber mode can't run normal commands. Create one extra connection per process (`redis.duplicate()`), lazily, and multiplex: one channel per event, a `Map<channel, Set<listener>>`, SUBSCRIBE when the first listener arrives, UNSUBSCRIBE when the last leaves. The second app instance in the test has its own container, so its own subscriber.
</details>

<details><summary>Hint 4: The sweeper</summary>

One transaction: `UPDATE holds SET status = 'expired' WHERE id IN (SELECT id FROM holds WHERE status = 'active' AND expires_at <= $now ... FOR UPDATE SKIP LOCKED) RETURNING id`, then free the seats `WHERE hold_id = ANY(ids) AND status = 'held'`. Broadcast after commit, grouped by event. Seats already taken over by a newer hold have a different `hold_id`, so they're untouched.
</details>

## M6 · Ship it

<details><summary>Hint 1: Route labels for metrics</summary>

Record on `res.on("finish")` and use `req.route.path` (plus `req.baseUrl` if you nest routers). If you nest routers, note that `req.baseUrl` is restored when an error leaves the router; defining full paths on one router avoids the surprise.
</details>

<details><summary>Hint 2: Dockerfile</summary>

Stage 1 installs everything and runs `tsc -p api/tsconfig.build.json`; stage 2 installs production deps only; the final stage copies `node_modules`, `api/dist` and `api/migrations`, sets `USER node` and `CMD ["node", "api/dist/server.js"]`. The worker and migration Job reuse the image with a different command.
</details>

<details><summary>Hint 3: Shutting down with open SSE streams</summary>

`server.close()` waits for every connection to end, and SSE connections never end on their own. Stop accepting, give streams a few seconds, then `server.closeAllConnections()`. Set `terminationGracePeriodSeconds` longer than that.
</details>

## M7 · Frontend

<details><summary>Hint 1: Live seat map hook</summary>

`useEffect(() => { const es = new EventSource(url); es.addEventListener("snapshot", ...); es.addEventListener("seats", ...); return () => es.close(); }, [url])`. On `snapshot` replace the seats; on `seats` patch the ones in `changes`.
</details>

<details><summary>Hint 2: Idempotency in the browser</summary>

Create the key when the hold succeeds (`crypto.randomUUID()`), keep it in state next to the hold, and send the same key every time "Book" is clicked for that hold. A new hold gets a new key.
</details>

## M8 · Design doc

<details><summary>Hint 1: What to write in "Estimates"</summary>

Pick a realistic scenario (an arena on-sale), state your assumptions, and derive: peak hold attempts per second, bookings per second, rows per year, concurrent SSE connections. The point is showing you know where the pressure is (hot seat rows, fan-out), not precision.
</details>

<details><summary>Hint 2: Failure modes</summary>

Go dependency by dependency (Postgres, Redis, Kafka, email, a pod) and answer three questions each: what does the user see, what protects correctness, how does it recover. A table works well.
</details>
