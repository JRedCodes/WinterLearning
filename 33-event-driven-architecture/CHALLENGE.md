# Challenge · Orders & Payments: lost, ghost and double-charged

**Type:** 🐛 Debug · **Est:** 4–5h · **Services:** Postgres (required), Kafka (integration tests only)

## Scenario

> **#incident-checkout** · *Sam (on-call):* What a week. Summary for whoever picks up the follow-ups:
>
> 1. **Ghost charges.** Customers whose checkout failed with `409 OUT_OF_STOCK` (the limited-edition cap sold out) were **charged anyway**. There's no order in our database for them, but payments has a charge with their order id.
> 2. **Checkout down when Kafka is down.** During Tuesday's broker maintenance, every `POST /orders` returned 500. Someone suggested "just publish after COMMIT", and we tried it on a branch, but then a deploy killed pods between commit and publish and we had paid... sorry, *placed* orders that payments never heard about. Reverted.
> 3. **Double charges.** After every deploy, a handful of customers are charged twice for one order. Kafka redelivers the messages that weren't committed when the old pods stopped. That's normal, apparently, but payments doesn't seem to care.
> 4. **Payments frozen on partition 1.** On Thursday, payments stopped processing for about a third of all orders, for six hours. The logs show the same message failing over and over: `Cannot read properties of undefined (reading 'amountCents')`, partition 1, offset 17, retrying forever. The other partitions were fine.
> 5. **...and that message?** It was an `OrderPlaced` from before we rolled out **v2** of the event (v2 replaced `totalCents` with `total: { amountCents, currency }`). Kafka keeps 30 days, so there are plenty of v1 events left, and payments only understands v2.
>
> I think it's **4 bugs** (symptoms 4 and 5 are two bugs feeding each other). We agreed on the fixes in the postmortem, see below. Tests that reproduce each symptom are in `test/`. Good luck. 🧾

The service is a layered Express app (routes → service → repositories) on Postgres, plus a payments consumer. Both talk to Kafka only through the `EventBus` interface (`src/events/eventBus.ts`). The tests use `InMemoryEventBus`, which can fail on demand.

## Your task

Find and fix the **4 bugs**. The postmortem agreed on *how* (the tests check exactly this, so stick to it):

| Symptoms | Agreed remediation |
|---|---|
| 1, 2 | **Transactional outbox.** Checkout must not publish to the bus at all. It writes the `OrderPlaced` event to an `outbox` table **in the same transaction** as the order. Implement `OutboxRelay.runOnce()` to move pending rows to the bus. |
| 3 | **Inbox.** Payments records each processed event id in an `inbox` table **in the same transaction** as the charge, and skips events it has already processed. |
| 4 | **Bounded retries + dead-letter topic.** `withDeadLetter` retries transient errors at most `maxAttempts` times (exponential backoff: `backoffMs · 2^(attempt-1)` between attempts), sends `PermanentError`s to the DLQ without retrying, then publishes the original message to the DLQ and returns normally so the partition moves on. |
| 5 | **Upcaster.** Implement `upcastOrderPlaced(version, payload)` (v1 → v2, v2 validated, anything else → `PermanentError`), and make payments decode records through it (malformed JSON → `PermanentError` too). |

Then fill in `challenge/DECISIONS.md`: polling relay vs CDC.

### Contract details the tests rely on

**Migration.** Add `migrations/002_*.sql` (don't edit `001_init.sql`, it's "already deployed") creating at least:

- `outbox`: `id` (bigserial, defines publish order), `topic` text, `message_key` text, `payload` jsonb (the event), `headers` jsonb, `published_at` timestamptz (NULL = pending). Extra columns (`event_id`, `attempts`, `last_error`, ...) are welcome.
- `inbox`: `consumer` text, `event_id` text, with a primary key on `(consumer, event_id)`. Payments uses consumer name `"payments"`.

**`OutboxRelay.runOnce(): Promise<number>`** publishes up to `batchSize` pending rows and returns how many it published.
- Publish rows in `id` order, each with its topic, key, value (the payload JSON) and headers. Set `published_at` only after the bus accepted the message.
- If a publish fails, stop: that row and everything after it stay pending (no reordering). `runOnce` still resolves with the count published so far.
- Two relays running at once must never publish the same row and must not wait for each other (hint: module 15).

**DLQ message** (published to the `dlqTopic` option): the original `key`, `value` and all original headers, plus `dlq-original-topic`, `dlq-original-partition`, `dlq-original-offset`, `dlq-error` (the error message), `dlq-attempts`. If the DLQ publish fails, the wrapper must reject.

## Acceptance criteria

- [ ] A stock failure (409) rolls back the order **and** its event: nothing is ever published for it. *(orders.test.ts)*
- [ ] `POST /orders` makes no bus calls; it writes one `OrderPlaced` v2 row to the outbox (topic `orders.v1`, key = order id, headers `event-type` / `event-version: 2` / `event-id`). *(orders.test.ts)*
- [ ] Checkout returns 201 while the broker is down; the relay publishes the event once it's back. *(orders.test.ts)*
- [ ] The relay publishes in order with key/value/headers, marks rows published, publishes nothing twice, keeps order across failures, respects the batch size, and lets two concurrent relays split the work. *(outboxRelay.test.ts)*
- [ ] Payments charges once per event: on redelivery, on concurrent duplicates, and after a failed attempt; processed ids land in `inbox`. *(payments.test.ts)*
- [ ] Retries are bounded with exponential backoff; poison messages go to the DLQ with diagnostics and stop blocking; permanent errors skip retries; DLQ failures aren't swallowed. *(deadLetter.test.ts)*
- [ ] v1 events are upcast to v2 and charged correctly; unknown versions and malformed JSON raise `PermanentError`. *(versioning.test.ts)*
- [ ] `DECISIONS.md` is filled in and compares polling with CDC. *(decisions.test.ts)*
- [ ] `npm test` and `npm run typecheck` pass. Run the suite 3 times: concurrency fixes must be deterministic.

## Getting started

```bash
cd 33-event-driven-architecture/challenge
make install
make up          # Postgres on 5433 + Kafka on 9092
make test        # 27 tests fail
make psql        # poke at orders, payments, outbox, inbox
```

With everything running you can watch the whole flow:

```bash
make dev                                               # API + relay + payments consumer
curl -s localhost:3000/orders -H 'content-type: application/json' \
  -d '{"customerId":"c1","items":[{"sku":"SKU-MUG","quantity":2}]}'
make dlq                                               # what ended up in the dead-letter topic
make test-integration                                  # end to end against real Postgres + Kafka
```

Reproduce symptom 4 by hand once you have the relay working: publish a v1 event with the Kafka console producer (see [docs/local-kafka-and-cli.md in module 32](../32-kafka-fundamentals/docs/local-kafka-and-cli.md)) and watch the consumer logs.

## Rules

- Don't modify the tests, `001_init.sql`, or `InMemoryEventBus`.
- `OrderService` must not depend on `EventBus` anymore: only the relay talks to the bus.
- Keep the layers: SQL lives in repositories, transactions are started by services/handlers, HTTP stays in routes.
- No new dependencies.

## Stretch goals

1. Add `attempts` / `last_error` to the outbox, and after 10 failed attempts move a row to an `outbox_failed` table so it stops blocking the rest. Add a test.
2. Write a `scripts/redrive.ts` that reads the DLQ topic and republishes messages to `orders.v1` (stripping the `dlq-*` headers). Why is it safe to replay into payments now?
3. Add a cleanup job: delete published outbox rows and inbox rows older than 7 days, in batches of 1000.
4. Add `GET /orders/:id` → `paymentStatus` by having the orders service consume a `PaymentCaptured` event published by payments (through *its own* outbox). That's your first choreographed saga.
5. Sketch (on paper or in `DECISIONS.md`) the saga for "reserve stock → capture payment → book courier" with compensations, both as choreography and as an orchestrator state machine.

## Done?

1. `npm test` is green and `npm run typecheck` is clean (and `make test-integration` if you have Docker).
2. Commit on your branch `module/33-event-driven-architecture`, push and open a PR. CI runs this module's tests, including the integration tests against real Postgres and Kafka.
3. From the repo root: `npm run progress -- 33` to tick it off on the roadmap.
4. Answer the questions in [INTERVIEW.md](INTERVIEW.md).
5. Add an entry to [LOG.md](../LOG.md).
6. Compare with the reference solution: `git diff main origin/solutions -- 33-event-driven-architecture/` (and read `SOLUTION.md` on that branch).

Stuck? → [HINTS.md](HINTS.md)
