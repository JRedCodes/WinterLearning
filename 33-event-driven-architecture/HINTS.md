# Hints · Event-Driven Architecture

Open one hint at a time. Give each a real try before opening the next.

## Symptoms 1 & 2: ghost charges, checkout down with Kafka

<details><summary>Hint 1</summary>

Read `OrderService.placeOrder` top to bottom and ask, for each line: "if the process died right here, or the next line threw, what would Postgres contain, and what would Kafka contain?"
</details>

<details><summary>Hint 2</summary>

The publish happens *inside* the transaction, before the stock reservation, which can still roll everything back. And the request waits on the broker. Moving the publish after COMMIT only swaps one failure for another (lesson section 2). The event has to become a row in the same transaction: an `OutboxRepository.enqueue(tx, topic, message)` that inserts into `outbox`. `orderPlacedMessage()` already builds the key, value and headers for you.
</details>

<details><summary>Hint 3</summary>

Migration sketch:
```sql
CREATE TABLE outbox (id bigserial PRIMARY KEY, event_id text NOT NULL UNIQUE, topic text NOT NULL,
  message_key text NOT NULL, payload jsonb NOT NULL, headers jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(), published_at timestamptz);
CREATE INDEX ON outbox (id) WHERE published_at IS NULL;
```
Insert with `$4::jsonb` for the payload (`message.value` is already JSON text) and `JSON.stringify(message.headers)` for the headers. Remove `bus` from `OrderService` and from its construction in `container.ts`.
</details>

## The relay

<details><summary>Hint 1</summary>

All of `runOnce` happens inside one `withTransaction`: claim rows → publish them → mark them. The row locks you take in the SELECT are what stop other relays from touching those rows.
</details>

<details><summary>Hint 2</summary>

`SELECT ... WHERE published_at IS NULL ORDER BY id LIMIT $1 FOR UPDATE SKIP LOCKED`. Plain `FOR UPDATE` doesn't duplicate, but the second relay waits for the first (the concurrency test checks for that). A JSONB column comes back from `pg` as a parsed object, so `JSON.stringify` it again for the message value.
</details>

<details><summary>Hint 3</summary>

```
rows = claim(batchSize)
published = []
for row in rows:
  try: await bus.publish(row.topic, [message]); published.push(row.id)
  catch: log; break          // order matters more than throughput
UPDATE outbox SET published_at = now() WHERE id = ANY($1::bigint[])   -- only `published`
return published.length
```
</details>

## Symptom 3: double charges

<details><summary>Hint 1</summary>

Payments must remember which events it has already handled. Where should that memory live so that "charged" and "remembered" can never disagree?
</details>

<details><summary>Hint 2</summary>

In the same database transaction as the payment insert. An `inbox` table with `PRIMARY KEY (consumer, event_id)` plus `INSERT ... ON CONFLICT DO NOTHING` tells you, via `rowCount`, whether this is the first time. A `SELECT` first and `INSERT` later would race when two deliveries arrive at once.
</details>

<details><summary>Hint 3</summary>

```ts
await withTransaction(pool, async (tx) => {
  if (!(await inbox.tryRecord(tx, "payments", event.eventId))) return; // duplicate
  await payments.insert(tx, { ... });                                  // pass tx, not the pool!
});
```
If `insert` throws, the transaction rolls back the inbox row too, so the retry is allowed.
</details>

## Symptom 4: the frozen partition

<details><summary>Hint 1</summary>

Look at `withDeadLetter`. "Messages must never be dropped" is right. "Retry until it works" isn't the only way to not drop them.
</details>

<details><summary>Hint 2</summary>

Loop at most `maxAttempts` times. Sleep `backoffMs * 2 ** (attempt - 1)` only *between* attempts (not after the last). `err instanceof PermanentError` → stop retrying immediately. After the loop, publish to `options.dlqTopic`, outside any try/catch, so a DLQ failure rejects.
</details>

<details><summary>Hint 3</summary>

```ts
const dlq: BusMessage = {
  key: event.key ?? "",
  value: event.value ?? "",
  headers: { ...event.headers, "dlq-original-topic": event.topic, "dlq-original-partition": String(event.partition),
             "dlq-original-offset": event.offset, "dlq-error": message, "dlq-attempts": String(attempts) },
};
```
</details>

## Symptom 5: v1 events

<details><summary>Hint 1</summary>

`JSON.parse(...) as OrderPlaced` is a promise to the compiler that nobody checks at runtime. What does the `event-version` header say, and what does a v1 payload look like? (`orderPlacedV1Schema` in `src/events/orderEvents.ts`.)
</details>

<details><summary>Hint 2</summary>

`upcastOrderPlaced(version, payload)`: `switch (version)`. For `"1"`, validate with the v1 schema, then map `totalCents` → `total: { amountCents, currency: "EUR" }`. For `"2"`, validate with the v2 schema. Otherwise throw `PermanentError`. Use `safeParse` and turn failures into `PermanentError` too.
</details>

<details><summary>Hint 3</summary>

In `PaymentsHandler`, replace the cast with a `decodeOrderPlaced(message)` that: throws `PermanentError` for a null value; wraps `JSON.parse` in try/catch → `PermanentError`; returns `upcastOrderPlaced(message.headers["event-version"], payload)`. Now a v1 event is charged, and a v3 event goes straight to the DLQ thanks to the wrapper you fixed for symptom 4.
</details>
