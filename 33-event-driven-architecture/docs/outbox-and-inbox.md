# Outbox and inbox in depth

## The full picture

```mermaid
sequenceDiagram
  participant API as Orders API
  participant DB as Orders DB
  participant R as Relay
  participant K as Kafka
  participant C as Payments consumer
  participant PDB as Payments DB
  API->>DB: BEGIN; INSERT order; INSERT outbox; COMMIT
  loop every 500ms
    R->>DB: BEGIN; SELECT ... FOR UPDATE SKIP LOCKED
    R->>K: publish (acks=all)
    K-->>R: ack
    R->>DB: UPDATE outbox SET published_at; COMMIT
  end
  K->>C: OrderPlaced (maybe twice)
  C->>PDB: BEGIN; INSERT inbox ON CONFLICT DO NOTHING; INSERT payment; COMMIT
  C->>K: commit offset
```

Every step is either atomic (one transaction) or safe to repeat. That's the whole trick.

## Where duplicates come from, and who absorbs them

| Duplicate source | Absorbed by |
|---|---|
| Producer retry after a lost ack | idempotent producer (broker-side sequence numbers) |
| Relay crashes after publish, before marking the row | consumer inbox (same `event-id` arrives twice) |
| Consumer crashes after the side effect, before the offset commit | consumer inbox |
| Rebalance during processing (two members briefly think they own a partition) | inbox primary key under concurrency |
| A human replays a DLQ message that was actually processed | inbox |

The event id must be **generated once, when the event is created** (in the outbox row), and never regenerated on retry. Otherwise the inbox can't recognise duplicates.

## Relay design choices

### One row per publish vs batching

Publishing one record per `send()` is simple and makes "stop at the first failure" trivial, but costs a round trip per event. Batching all claimed rows into one `send()` per topic is much faster. With an idempotent producer, a batch to a single partition is all-or-nothing, but a batch spanning partitions can partially succeed. If you batch, treat any error as "nothing in this batch was published" and let consumers dedupe the ones that were.

### Ordering

Rows are claimed `ORDER BY id`. `bigserial` ids come from a sequence and are assigned at INSERT time, **not commit time**. Transaction A can take id 10, transaction B takes id 11 and commits first, and a relay running between the two commits publishes 11 and later 10. For events of *different* orders that doesn't matter (Kafka only orders per key anyway). For events of the *same* order, the two writes are almost always serialized by a row lock on the order itself, so their ids are in commit order. If you need stronger guarantees, order by a per-aggregate version column.

### Head-of-line blocking

"Stop at the first failure" keeps order, but one permanently failing row (say, a topic that was deleted) blocks the whole outbox. Mitigations: alert on outbox age; after N attempts, move the row to a `outbox_failed` table for a human; or partition the relay by key hash so only that lane stalls.

### How many relays?

Run one relay loop per service instance. `SKIP LOCKED` makes them cooperate. Note that each relay holds row locks **while publishing**, so keep batches small enough that a slow broker doesn't hold locks for long, and set a publish timeout.

### Cleanup

The outbox grows forever unless you prune it:

```sql
DELETE FROM outbox WHERE published_at < now() - interval '7 days';
```

Run it from a scheduled job, in batches if the table is large. The partial index `WHERE published_at IS NULL` keeps the relay's query fast regardless of table size.

### Monitoring

```sql
-- age of the oldest pending event: your end-to-end publish lag
SELECT now() - min(created_at) AS oldest_pending FROM outbox WHERE published_at IS NULL;
-- rows that keep failing
SELECT id, topic, attempts, last_error FROM outbox WHERE published_at IS NULL AND attempts > 3;
```

## CDC in a bit more detail

With Debezium:

1. Postgres runs with `wal_level=logical`. Debezium creates a **replication slot**, a bookmark in the WAL that Postgres won't discard until Debezium confirms it has read past it.
2. Your service still writes to an outbox table (or uses `pg_logical_emit_message` to write to the WAL without a table).
3. Debezium's outbox router turns each outbox insert into a Kafka record, routing by a `topic` / `aggregatetype` column and keying by an `aggregateid` column.

The operational gotcha: if Debezium stops (crash, misconfiguration, a paused connector), the slot holds the WAL **forever**, and the primary's disk fills up. Monitor slot lag (`pg_replication_slots`) as seriously as disk space.

## Inbox design choices

### Unique constraint vs dedupe table

If the side effect has a natural key, a unique constraint on it can be enough: `UNIQUE (order_id)` on `payments` makes a second charge for the same order fail. It's simpler, but it ties idempotency to business rules (what if an order legitimately gets two payments later, like a split payment?). A separate inbox table keyed by `(consumer, event_id)` is generic and explicit. Many teams use both: the inbox for delivery semantics, constraints for business invariants.

### Pruning the inbox

Inbox rows only need to live as long as a duplicate could still arrive: longer than topic retention plus the longest replay window you'd ever do. 30 days is a common choice. Delete older rows in a scheduled job.

### Side effects outside your database

```ts
// inbox + "intent" in one transaction
await withTransaction(pool, async (tx) => {
  if (!(await inbox.tryRecord(tx, "payments", event.eventId))) return;
  await payments.insert(tx, { orderId, status: "pending", idempotencyKey: event.eventId });
});
// then call the provider with the SAME idempotency key; safe to retry
await stripe.charges.create({ ... }, { idempotencyKey: event.eventId });
await payments.markCaptured(orderId);
```

If the process dies after the transaction but before the provider call, a background job finds `pending` payments and retries them with the same idempotency key. This is a tiny outbox on the consumer side, so the patterns compose.
