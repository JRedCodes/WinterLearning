# Hints · System Design

Open one hint at a time. These point you at the hard part of each problem and the questions to ask yourself; they don't give you the design.

## Any design: getting unstuck

<details><summary>Hint 1: I'm staring at an empty Requirements section</summary>

Pretend you're the product manager. What are the three things a user does most? Then ask the non-functional questions from the lesson's table one by one (scale, latency, availability, consistency, durability) and write down an assumption for each, with a number.
</details>

<details><summary>Hint 2: my estimates don't lead anywhere</summary>

After each number ask: "does this fit on one machine?" Compare against the capacity table in [docs/estimates-cheatsheet.md](docs/estimates-cheatsheet.md). The places where the answer is "no" are your deep dives.
</details>

<details><summary>Hint 3: my diagram has 15 boxes</summary>

Delete everything, then add components back one at a time, each with the requirement or number that forces it. If nothing forces it, it stays deleted.
</details>

## 1. News feed

<details><summary>Hint 1</summary>

The central question: when Alice posts, do you do the work then (write her post id into every follower's feed), or later (when Bob opens his feed, gather recent posts from everyone he follows)? Estimate the cost of each with your numbers.
</details>

<details><summary>Hint 2</summary>

Fan-out on write makes reads a single lookup but turns one post by an account with 50M followers into 50M writes. Fan-out on read has no write amplification but makes every feed open a scatter-gather over hundreds of followees. Is there a follower-count threshold where you'd switch?
</details>

<details><summary>Hint 3</summary>

Hybrid: push for normal authors into a per-user feed list (e.g. a Redis sorted set of the latest ~800 post ids, keyed by user), pull for celebrities at read time, merge the two by timestamp. Paginate with a cursor of `(timestamp, post_id)`, not an offset, because new posts shift offsets while you scroll. Inactive users don't need a precomputed feed at all.
</details>

## 2. Notification system

<details><summary>Hint 1</summary>

Think about what happens when marketing sends 50M emails at 9:00 and, at 9:01, a user requests a 2FA code. Where does the 2FA SMS wait?
</details>

<details><summary>Hint 2</summary>

Separate queues per channel and per priority, workers per queue, and a rate limiter per provider. Retries need backoff with jitter and a DLQ. Where do you check user preferences: before enqueuing, or in the worker? (Consider preferences changing while a message sits in the queue.)
</details>

<details><summary>Hint 3</summary>

Idempotency end to end: callers send an idempotency key (`event_id + user_id + channel`), you store it with a unique constraint or a Redis `SET NX` before enqueuing, and workers record "sent" per delivery attempt so a redelivered job doesn't text the user twice. Providers can still duplicate rarely; say so.
</details>

## 3. Chat

<details><summary>Hint 1</summary>

The gateways holding WebSockets are stateful. When A (connected to gateway 3) sends to B (connected to gateway 17), how does gateway 3 know about gateway 17? And what if B isn't connected anywhere?
</details>

<details><summary>Hint 2</summary>

Persist first, then deliver: the message is acknowledged to the sender only after it's durably stored. Give each message a per-conversation sequence number for ordering, and a client-generated id so retries don't create duplicates.
</details>

<details><summary>Hint 3</summary>

Connection registry in Redis (`user → gateway id`, refreshed by heartbeats) or a pub/sub channel per user/gateway. Offline: store, send a push notification, and let the client sync "everything after sequence N" per conversation when it reconnects. Partition the message store by `conversation_id` (wide-column or partitioned Postgres) so a conversation's history is one range read.
</details>

## 4. Rate limiter

<details><summary>Hint 1</summary>

You implemented the algorithms in module 19. The system questions: where does the state live, how many network round trips does each request pay, and what happens when that store is unavailable?
</details>

<details><summary>Hint 2</summary>

Compute memory per key for your algorithm (a token bucket is two numbers; a sliding log is one entry per request) times the number of active keys. Then think about one enterprise key doing 20k req/min, all hashing to the same Redis shard.
</details>

<details><summary>Hint 3</summary>

One Lua script per check (atomic, one round trip), Redis Cluster sharded by key, rules pushed to gateways and cached locally, short timeouts and fail-open for most APIs (fail-closed for expensive or abuse-prone ones like login or SMS). For multi-region, either give each region a share of the limit or sync counters asynchronously and accept some overshoot.
</details>

## 5. Ticketing

<details><summary>Hint 1</summary>

Separate the two very different paths: browsing (huge, read-only, cacheable) and buying (small, write-heavy, must be correct). Which one needs strong consistency, and how many writes/s does it really receive?
</details>

<details><summary>Hint 2</summary>

Double booking is prevented by the database, not by application checks: a conditional update (`UPDATE seats SET status='held', hold_expires_at=... WHERE id=$1 AND (status='available' OR hold_expires_at < now())`) or row locks, plus a unique constraint on tickets per seat. What happens to holds whose buyer walks away?
</details>

<details><summary>Hint 3</summary>

A virtual waiting room in front of the buy path turns 2M simultaneous users into a steady admitted rate the database can handle (and is fairer than "whoever retries fastest"). Payments: create the order in `pending` with an idempotency key, call the provider with that key, confirm via webhook, and run a reconciliation job for orders stuck in pending. Module 15 covers the locking patterns.
</details>
