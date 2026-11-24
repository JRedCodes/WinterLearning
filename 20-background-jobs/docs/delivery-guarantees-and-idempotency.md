# Delivery guarantees and idempotency

"At-most-once", "at-least-once" and "exactly-once" come up in every conversation about queues, streams and distributed systems. This page pins down what they mean and what you can actually build.

## The three guarantees

Think about *when the consumer acknowledges* relative to *when it does the work*.

### At-most-once: ack, then work

```
take message → ACK → process
```

If the consumer crashes during processing, the message is already gone. Each message is processed zero or one times. Fine for metrics samples, presence pings, cache warmups: things where losing one occasionally is acceptable and duplicates are worse.

### At-least-once: work, then ack

```
take message → process → ACK
```

If the consumer crashes after processing but before the ack, the message is redelivered and processed again. Each message is processed one or more times. **This is the default of BullMQ, SQS, RabbitMQ (with manual acks) and Kafka consumers that commit after processing.** Nothing is lost; duplicates are your problem.

### Exactly-once: the honest version

True exactly-once *delivery* across independent systems isn't achievable in general: there's always a window between "the side effect happened" and "we recorded that it happened" where a crash leaves you uncertain. Two-phase commit narrows it at a big cost in availability and complexity, and most external APIs (email, payments) don't participate anyway.

What systems call "exactly-once" is really **exactly-once *effect***:

> at-least-once delivery + idempotent processing = effectively once

Kafka's "exactly-once semantics", for example, covers read-process-write *within Kafka* using transactions. Once you call an email API, you're back to idempotency.

## Making a handler idempotent

An operation is idempotent if doing it N times has the same effect as doing it once.

| Operation | Idempotent? | Make it so |
|---|---|---|
| `UPDATE users SET thumbnail = $1 WHERE id = $2` | ✅ | |
| `UPDATE accounts SET balance = balance + 10` | ❌ | record the transfer id in a unique-keyed `ledger` table in the same transaction |
| `INSERT INTO orders ...` | ❌ | `ON CONFLICT (idempotency_key) DO NOTHING` |
| `DELETE FROM sessions WHERE id = $1` | ✅ | |
| Send an email / SMS | ❌ | provider idempotency key + processed-job key |
| Charge a card | ❌ | **always** a provider idempotency key (Stripe's `Idempotency-Key`) |
| Upload file to `s3://bucket/thumbs/<userId>.png` | ✅ (same key overwrites) | deterministic object names |

### Pattern 1: deterministic identifiers

Derive ids from the input instead of generating random ones: object storage keys, database primary keys, job ids, provider idempotency keys. Then a second run writes the same thing to the same place.

### Pattern 2: dedupe table in the same transaction

When the side effect is a database write, put the "already done?" record in the same transaction:

```sql
BEGIN;
INSERT INTO processed_jobs (key) VALUES ('welcome-email:u_123')
  ON CONFLICT DO NOTHING;           -- 0 rows affected → someone did it, ROLLBACK and skip
UPDATE ... ;                        -- the actual effect
COMMIT;
```

Both commit or neither does. This is airtight, because there's no window between the effect and the record.

### Pattern 3: claim / complete / release in Redis

When the side effect is *outside* your database (an HTTP call), you can't share a transaction. The three-state claim used in the challenge:

```
claim:    SET key "in-progress" NX PX <lease>   → OK = acquired
          else GET key: "done" → skip, otherwise → busy (retry later)
effect:   call the provider (with an idempotency key!)
success:  SET key "done" PX <long ttl>
failure:  DEL key IF value == "in-progress"     (Lua compare-and-delete)
```

Design questions you should be able to answer:

- **Why a lease?** If the claimant crashes, the claim must not block the work forever.
- **How long?** Longer than the longest plausible processing time. Too short and a slow-but-alive worker loses its claim to a second worker (both send). Too long and a crash delays the retry.
- **Why compare-and-delete on release?** If the claim expired and *another* worker completed the job, a blind `DEL` would erase their "done" marker. (A fully robust version stores a unique token per claimant and only releases its own token. Worth mentioning in an interview.)
- **How long to remember "done"?** At least as long as duplicates can plausibly arrive: retries, stalled-job recovery, DLQ replays. Days to weeks.
- **What's the remaining gap?** A crash after the effect but before `complete()`. Close it with the provider's idempotency key.

### Pattern 4: idempotency at the API boundary

The same thinking applies to HTTP: clients retry `POST /payments` after a timeout. APIs accept an `Idempotency-Key` header, store the first response under that key, and replay it for duplicates. You'll implement this in [module 23](../../23-api-design/README.md).

## Producer-side duplicates

Consumers aren't the only source of duplicates. Producers retry too:

- HTTP request retried by the client or a proxy → handler enqueues twice.
- Producer enqueued, then crashed before recording that it did, and re-enqueued on restart.

BullMQ's custom `jobId` dedupes adds *while the job exists*. After `removeOnComplete` deletes it, the same id can be added again. So job-id dedupe is a useful first line, but consumer idempotency is what you rely on.

## Ordering is a separate guarantee

At-least-once says nothing about order. With concurrent workers, retries and delays, job B can finish before job A even if A was added first. If "email changed" and "email changed again" must apply in order, either make the handler order-independent (store a version, ignore older ones) or use a partitioned log (Kafka, module 32) where one partition is consumed in order.
