# Partitioning and ordering

## How the default partitioner works

For a record with a key, Kafka's Java client (and kafkajs's `DefaultPartitioner`) computes:

```
partition = (murmur2(utf8(key)) & 0x7fffffff) % numPartitions
```

- **murmur2** is a fast, non-cryptographic hash with good distribution. It isn't meant to be secure, just to spread keys evenly and be cheap.
- **`& 0x7fffffff`** clears the sign bit so the result is non-negative. It is *not* `Math.abs`: in Java, `Math.abs(Integer.MIN_VALUE)` is still negative, and the two give different results for every negative hash. Matching Java exactly is the whole point.
- **`% numPartitions`** maps the hash to a partition. This is why changing the partition count moves keys.

### murmur2 in JavaScript: the bit-twiddling traps

JavaScript numbers are 64-bit floats. Bitwise operators convert to 32-bit integers, but multiplication doesn't:

```ts
0x5bd1e995 * 0x9747b28c          // 4.6e18: a float, low bits already lost
Math.imul(0x5bd1e995, 0x9747b28c) // exact 32-bit product (wrapping), like Java's int *
```

- Use `Math.imul(a, b)` for 32-bit multiplication.
- Use `>>>` (unsigned shift) where Java uses `>>>`.
- Use `| 0` to force a value back to a signed 32-bit int at the end.
- Hash the **UTF-8 bytes** (`new TextEncoder().encode(key)`). `"é".charCodeAt(0)` is one UTF-16 code unit, but it's two bytes in UTF-8, and Java hashes the bytes.

### kafkajs's two partitioners

kafkajs v2 ships `Partitioners.DefaultPartitioner` (Java-compatible, the default since v2.0) and `Partitioners.LegacyPartitioner` (what v1 used, **not** Java-compatible). If you upgrade an old service, or mix languages, check which one is in use. Otherwise the same key can land on different partitions depending on who produced it. kafkajs logs a warning at startup until you pass `createPartitioner` explicitly; the challenge's adapter does.

Unkeyed records are spread across partitions. The Java client uses a "sticky" partitioner (fill a batch for one partition, then switch), which batches better than strict round-robin.

## Choosing a key

Ask: **which events must be processed in order relative to each other?**

| Domain | Typical key | Why |
|---|---|---|
| Orders | `orderId` | placed → paid → shipped → delivered must stay in order |
| Bank account ledger | `accountId` | debits and credits must apply in order (balance checks) |
| User profile changes | `userId` | the latest update must win |
| Click stream / logs | none or `sessionId` | usually order doesn't matter, so spread evenly |
| IoT sensor readings | `deviceId` | per-device time series |

### Hot keys

One key can only use one partition, and one partition is read by one consumer. If 40% of your traffic is one customer and you key by `customerId`, one partition (and one consumer) gets 40% of the load while the others idle. Options:

- Key by something finer (`orderId` instead of `customerId`) if you only need ordering at that level.
- Salt hot keys (`customer-9:${n % 4}`) and accept that ordering only holds per salted key.
- Give the giant tenant its own topic.

### The keyed-by-orderId, aggregated-by-customer trap

The challenge keys by `orderId` but builds totals **per customer**. Two orders of the same customer can be on different partitions, owned by different consumers, processed at the same moment. With an in-memory store in one process, that's fine. With Postgres and two consumer processes, a read-modify-write like this:

```ts
const current = await repo.get(customerId);      // both read net = 1000
await repo.save({ ...current, net: current.net + amount });  // both write; one update is lost
```

is a classic lost update ([module 15](../../15-transactions-concurrency/README.md)). The fixes are the same as in module 15: atomic `UPDATE ... SET net = net + $1`, or `SELECT ... FOR UPDATE` in a transaction. Alternatively, key by `customerId` so one consumer owns each customer, and accept the hot-key risk. There's no free option, which is why it belongs in `DECISIONS.md`.

## How many partitions?

- **Upper bound on consumer parallelism** = partition count. Estimate peak throughput ÷ throughput of one consumer, then add headroom (2–4×).
- **More isn't free**: every partition is files and memory on the brokers, more leader elections on failure, and longer rebalances. Thousands per topic is unusual; tens is common.
- **Changing it later remaps keys.** You can only *add* partitions, never remove them, and adding breaks per-key ordering during the transition. If ordering matters, plan the count up front, or migrate to a new topic (`orders.v2`) and switch consumers over.

A reasonable default for an important business topic at a small company is 6–12. For a high-volume topic at a large one, size it from measurements.

## Ordering pitfalls beyond keys

- **Retries with many in-flight requests** can reorder batches unless the producer is idempotent.
- **Parallel processing inside a consumer** (say, `Promise.all` over a batch, or kafkajs `partitionsConsumedConcurrently` misunderstood as "concurrency within a partition") throws away the ordering Kafka gave you. Concurrency across partitions is safe; within a partition it isn't.
- **Retry topics** (move a failed record to `orders.retry` and continue) let later events of the same key overtake the failed one. Fine for independent events, wrong for state transitions. Module 33 discusses this trade-off with dead-letter topics.
