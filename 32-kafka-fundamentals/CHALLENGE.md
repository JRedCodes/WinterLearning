# Challenge · Order Events Pipeline

**Type:** 🧩 Scaffold · **Est:** 4–5h · **Services:** Kafka (optional for `npm test`, required for the integration tests)

## Scenario

> **#team-commerce** · *Dana (staff engineer):* We're moving off "the orders service calls five other services synchronously". From now on orders publishes events to Kafka and everyone else subscribes. I've stubbed `wl-32` with the contract (`src/domain/orderEvents.ts`), the messaging ports, a kafkajs adapter and an in-memory Kafka model for tests. Two pieces are yours: the **producer** the orders service will use, and the first consumer, a **customer-totals projection** that support wants for their dashboard.
>
> Non-negotiables: events of one order stay in order; the projection must never double-count, even when Kafka redelivers (and it will, on every deploy); one bad record must not stall a partition. Also, the Java team produces to this topic too, so our partitioner must agree with theirs. 🙏

## Your task

Work through the numbered `TODO(n)` comments in `challenge/src/` (and one write-up):

| TODO | File | What |
|---|---|---|
| 1 | `messaging/partitioner.ts` | `murmur2`, `toPositive`, `partitionFor`, byte-compatible with the Java client |
| 2 | `producer/orderEventProducer.ts` | `toMessage` (key, JSON value, headers), `publish`, `publishMany` (validated, batched, `acks: -1`) |
| 3 | `projection/applyEvent.ts` | pure reducer: `(totals, event) → totals` |
| 4 | `consumer/decode.ts` | `decodeOrderEvent`: headers → version → JSON → zod, never throws |
| 5 | `consumer/orderProjectionConsumer.ts` | `start()` (from beginning, manual commits) and `handle()` (skip bad records, dedupe, apply, save, **then** commit `offset + 1`) |
| 6 | `ops/lag.ts` | `computeLag`: per-partition and total consumer lag |
| 7 | `DECISIONS.md` | decide the key and partition count for `orders.v1` |

Read `src/messaging/inMemoryBroker.ts` before TODO 5. It's the Kafka model the tests run against, and it shows exactly when redeliveries happen.

## Acceptance criteria

- [ ] `murmur2` matches the Java client's reference values (including multi-byte UTF-8 keys); `toPositive` clears the sign bit; `partitionFor` is deterministic, in range, evenly spread, and rejects invalid counts. *(partitioner.test.ts)*
- [ ] Records are keyed by `orderId`, carry the whole event as JSON, and have `event-type`, `event-version`, `event-id` and `content-type` headers. *(producer.test.ts)*
- [ ] `publish` validates with zod (`InvalidOrderEventError`, nothing sent), fills in `eventId` / `occurredAt` unless provided, uses `acks: -1`, and returns `{ eventId, partition, offset }`. *(producer.test.ts)*
- [ ] `publishMany` validates everything first, then sends **one** request. *(producer.test.ts)*
- [ ] `applyEvent` is pure, handles both event types and a customer's first event, and keeps the latest `occurredAt`. *(applyEvent.test.ts)*
- [ ] `decodeOrderEvent` rejects missing/unknown types, unsupported versions, tombstones, bad JSON, schema failures and header/payload mismatches without throwing. *(decode.test.ts)*
- [ ] The consumer subscribes from the beginning with `autoCommit: false`, commits `offset + 1` only after a successful save, never commits when the save fails, applies redelivered and duplicate events exactly once, and skips undecodable records with a warning that names the record's coordinates. *(consumer.test.ts)*
- [ ] `computeLag` handles "never committed", retention past the committed offset, and sorting. *(lag.test.ts)*
- [ ] End to end: two consumers in a group split partitions, a second group gets a full copy, and a crash mid-stream doesn't double-count. *(pipeline.test.ts)*
- [ ] `DECISIONS.md` has Context / Options considered / Decision / Consequences filled in, and the decision names a partition count and the key. *(decisions.test.ts)*
- [ ] `npm test` and `npm run typecheck` pass. With Kafka running, `make test-integration` passes too.

## Getting started

```bash
cd 32-kafka-fundamentals/challenge
make install
make test              # unit + pipeline tests against the in-memory broker (no Docker needed)
```

Then, with Docker:

```bash
make up                # Kafka 3.9 in KRaft mode on localhost:9092
make test-integration  # the same code against a real broker
make dev               # run the projection worker (logs totals + lag every 5s)
make produce           # in another terminal: publish sample events
make groups            # see partitions, committed offsets and lag
```

Suggested order: 1 → 2 → 3 → 4 → 5 → 6 → 7. `npm run test:watch -- partitioner` runs one file in watch mode.

## Rules

- Don't modify the tests or `inMemoryBroker.ts`.
- Core code (`producer/`, `consumer/`, `projection/`) must not import `kafkajs`. Only `messaging/kafkaAdapter.ts` and the composition roots may.
- `applyEvent` stays pure: no I/O, no mutation.
- No new dependencies.

## Stretch goals

1. Add a `PostgresProjectionStore` (database `wl_32`) that implements `save(totals, eventId)` as one transaction with a `processed_events` table and an atomic `UPDATE ... SET net_total_cents = net_total_cents + $1`. Run two workers at once and convince yourself there are no lost updates.
2. Commit every 50 records or every 2 seconds instead of after every record, using a small offset tracker per partition. What changes about redeliveries after a crash?
3. Make the worker expose `GET /totals/:customerId` and `GET /health` (lag below a threshold) with Express.
4. Reset the group's offsets to the beginning with the CLI (`kafka-consumer-groups.sh --reset-offsets --to-earliest`) and confirm the projection rebuilds to the same totals.
5. Produce the same key from the Kafka console producer and from `npm run produce`, and check the partitions match.

## Done?

1. `npm test` is green and `npm run typecheck` is clean (and `make test-integration` if you have Docker).
2. Commit on your branch `module/32-kafka-fundamentals`, push and open a PR. CI runs this module's tests, including the integration tests against a real broker.
3. From the repo root: `npm run progress -- 32` to tick it off on the roadmap.
4. Answer the questions in [INTERVIEW.md](INTERVIEW.md).
5. Add an entry to [LOG.md](../LOG.md).
6. Compare with the reference solution: `git diff main origin/solutions -- 32-kafka-fundamentals/` (and read `SOLUTION.md` on that branch).

Stuck? → [HINTS.md](HINTS.md)
