# Event-driven architecture: one-page cheat sheet

## Vocabulary

| Term | One-liner |
|---|---|
| Command | "do X": one receiver, can be refused |
| Event | "X happened": any number of receivers, a fact |
| Dual write | writing DB + broker separately; one can fail without the other |
| Transactional outbox | write the event to a table in the same tx as the change; relay publishes later |
| Polling publisher | relay that queries the outbox (`FOR UPDATE SKIP LOCKED`) |
| CDC | change data capture: read the DB's log (WAL) and publish changes (Debezium) |
| Inbox / idempotent consumer | record processed event ids in the same tx as the effect |
| Poison message | a record that fails every time and blocks its partition |
| DLQ / dead-letter topic | where unprocessable records go, with diagnostics, for later replay |
| Upcaster | converts an old event version to the current shape |
| Saga | multi-service workflow of local transactions + compensations |
| Choreography / orchestration | services react to each other's events / a coordinator sends commands |
| Event sourcing | events ARE the source of truth; state is derived by replay |

## The patterns in SQL

```sql
-- write side (orders): one transaction
BEGIN;
INSERT INTO orders ...;
INSERT INTO outbox (event_id, topic, message_key, payload, headers) VALUES (...);
COMMIT;

-- relay
BEGIN;
SELECT id, topic, message_key, payload, headers FROM outbox
 WHERE published_at IS NULL ORDER BY id LIMIT 100 FOR UPDATE SKIP LOCKED;
-- publish each, await ack, stop at first failure
UPDATE outbox SET published_at = now() WHERE id = ANY($1);
COMMIT;

-- read side (payments): one transaction
BEGIN;
INSERT INTO inbox (consumer, event_id) VALUES ('payments', $1) ON CONFLICT DO NOTHING;  -- rowCount 0 → skip
INSERT INTO payments ...;
COMMIT;
```

## Retry / DLQ policy

```
attempt handler
  ok                 → commit offset
  PermanentError     → DLQ now
  other error        → backoff (base · 2^(n-1)) and retry, up to maxAttempts → DLQ
DLQ message = original key + value + headers + dlq-original-topic/partition/offset, dlq-error, dlq-attempts, dlq-failed-at
DLQ publish fails    → throw (don't commit, don't lose)
```

## Rules of thumb

- Never write to two systems and hope. One transaction + async relay.
- Delivery is at-least-once everywhere. Every consumer dedupes by event id, in the same transaction as its effect.
- Generate the event id once, when the event is created. Never on retry.
- Classify errors: transient → retry; permanent → dead-letter. Never retry forever; never drop silently.
- Version events (header). Deploy consumers before producers. Keep upcasters for old versions.
- Irreversible saga steps go last. Every waiting saga state needs a timeout.
- Monitor: outbox oldest-pending age, consumer lag, DLQ rate, replication slot lag (CDC).
