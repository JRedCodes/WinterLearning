# Hints · Kafka Fundamentals

Open one hint at a time. Give each a real try before opening the next.

## TODO 1: murmur2 and partitionFor

<details><summary>Hint 1</summary>

Get the bytes first: `new TextEncoder().encode(key)` gives a `Uint8Array` of UTF-8 bytes. Then follow the pseudo-code in the file step by step. Start with the tests for `""`, `"a"`, `"ab"`, `"abc"` (only the tail logic) before the longer strings (the block loop).
</details>

<details><summary>Hint 2</summary>

Every `*` in the pseudo-code must be `Math.imul(x, M)`. A plain `*` produces a float that's too big and loses the low bits. Reading a little-endian word: `b0 | (b1 << 8) | (b2 << 16) | (b3 << 24)`. The tail for `rest = length & 3` bytes starts at index `blocks * 4`, where `blocks = length >>> 2`.
</details>

<details><summary>Hint 3</summary>

```
h = (SEED ^ length) | 0
for each block: k = imul(k, M); k ^= k >>> 24; k = imul(k, M); h = imul(h, M); h ^= k
if rest >= 3: h ^= byte[tail+2] << 16
if rest >= 2: h ^= byte[tail+1] << 8
if rest >= 1: h ^= byte[tail]; h = imul(h, M)
h ^= h >>> 13; h = imul(h, M); h ^= h >>> 15
return h | 0
```
`toPositive = n & 0x7fffffff`. `partitionFor` validates `numPartitions` with `Number.isInteger(n) && n >= 1`, then `toPositive(murmur2(bytes)) % n`.
</details>

## TODO 2: the producer

<details><summary>Hint 1</summary>

Start with `toMessage`: it's a pure mapping and its tests are the easiest. Use `HEADERS.type` etc. as computed keys: `{ [HEADERS.type]: event.type }`.
</details>

<details><summary>Hint 2</summary>

`orderEventInputSchema.safeParse(input)` gives `{ success, data, error }`. `error.issues` is an array of `{ path, message }`, which you can map to strings for `InvalidOrderEventError`. Write one private helper that validates and completes one input (fills `eventId` / `occurredAt` with `??`), and use it in both `publish` and `publishMany`.
</details>

<details><summary>Hint 3</summary>

`publishMany`: `const events = inputs.map(complete)` runs validation for all inputs, and throws on the first bad one *before* anything is sent. Then one `this.producer.send({ topic, acks: -1, messages: events.map(toMessage) })`. `publish` takes `result[0]` and returns `{ eventId, partition: r.partition, offset: r.baseOffset }`.
</details>

## TODO 3: applyEvent

<details><summary>Hint 1</summary>

Handle the "no current totals" case by building a zero-valued `CustomerTotals` first. Then every event type is just "update the base".
</details>

<details><summary>Hint 2</summary>

Never assign to `current.x`. Return `{ ...base, placedCount: base.placedCount + 1, ... }`. Compare timestamps with `Date.parse(a) > Date.parse(b)`.
</details>

<details><summary>Hint 3</summary>

```ts
switch (event.type) {
  case "OrderPlaced": return { ...base, placedCount: +1, net: +total, lastEventAt };
  case "OrderCancelled": return { ...base, cancelledCount: +1, net: -total, lastEventAt };
  default: { const x: never = event; throw new Error(...) }
}
```
</details>

## TODO 4: decodeOrderEvent

<details><summary>Hint 1</summary>

Follow the numbered list in the file literally, one `if` and early `return { ok: false, reason }` per step. The cheap checks (headers) come first.
</details>

<details><summary>Hint 2</summary>

`JSON.parse` throws, so wrap only that call in `try/catch`. For the schema step use `orderEventSchema.safeParse(json)`, which never throws. `ORDER_EVENT_TYPES` is a readonly tuple: `(ORDER_EVENT_TYPES as readonly string[]).includes(type)`.
</details>

## TODO 5: the projection consumer

<details><summary>Hint 1</summary>

`start()` is two calls on `this.consumer`: `subscribe` and `run`. The `eachMessage` you pass is `(payload) => this.handle(payload)`.
</details>

<details><summary>Hint 2</summary>

Write a small `commit` closure at the top of `handle` that commits `{ topic, partition, offset: (BigInt(message.offset) + 1n).toString() }`. Then there are three exits: undecodable → warn + commit; already processed → info + commit; normal → get, apply, save, commit. Don't wrap `save` in try/catch: if it throws, the error must escape `handle` so nothing gets committed and the broker retries.
</details>

<details><summary>Hint 3</summary>

```
decoded = decodeOrderEvent(message)
if !decoded.ok: logger.warn("skipping...", { topic, partition, offset: message.offset, reason }); await commit(); return
if await store.hasProcessed(event.eventId): logger.info("duplicate ..."); await commit(); return
current = await store.get(event.customerId)
await store.save(applyEvent(current, event), event.eventId)
await commit()
```
Why does the "commit fails after save" test pass with this? Trace it in `inMemoryBroker.ts`: the failed commit makes `handle` throw, the broker retries the same record, and `hasProcessed` now says yes.
</details>

## TODO 6: computeLag

<details><summary>Hint 1</summary>

Build a `Map<partition, committedOffset>` from the committed list first, so partitions that are missing are easy to detect.
</details>

<details><summary>Hint 2</summary>

For each watermark entry: `committed = raw === undefined || raw < 0 ? null : raw`. Read from `from = committed === null ? low : Math.max(committed, low)`. Then `lag = Math.max(0, high - from)`. Sort by partition and sum.
</details>

## TODO 7: DECISIONS.md

<details><summary>Hint 1</summary>

Re-read section 5 of the lesson and [docs/partitioning-and-ordering.md](docs/partitioning-and-ordering.md), especially "the keyed-by-orderId, aggregated-by-customer trap". There's no single right answer. The tests only check you made a decision and explained it.
</details>
