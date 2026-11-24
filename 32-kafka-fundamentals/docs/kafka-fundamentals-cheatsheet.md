# Kafka fundamentals: one-page cheat sheet

For CLI commands and full kafkajs snippets see the repo-wide [Kafka cheat sheet](../../docs/cheatsheets/kafka.md).

## Vocabulary

| Term | One-liner |
|---|---|
| Record | key (optional) + value + headers + timestamp |
| Topic | named, partitioned, append-only log |
| Partition | ordered log; unit of parallelism and ordering |
| Offset | position in a partition; committed offset = **next** to read |
| High / low watermark | next offset to be written / oldest offset still retained |
| Segment | file a partition is stored in; retention deletes whole segments |
| Consumer group | consumers sharing a topic; 1 partition → 1 member |
| Rebalance | reassigning partitions when members join, leave or time out |
| Lag | high watermark − committed offset |
| Leader / follower | replica that takes writes / replicas that copy it |
| ISR | replicas caught up with the leader |
| KRaft | Raft-based metadata quorum that replaced ZooKeeper |
| Compaction | keep the latest record per key; `null` value = tombstone |

## Rules of thumb

- Same key → same partition → ordered. Nothing is ordered across partitions.
- Max useful consumers per group = number of partitions.
- `acks: -1` + idempotent producer for anything that matters.
- Commit **after** processing; make processing idempotent (dedupe by event id, atomically with the effect).
- Commit `offset + 1`. Offsets are 64-bit strings, so use `BigInt`.
- Retry transient errors (throw). Skip or dead-letter permanent ones (don't block the partition).
- Don't add partitions to a keyed topic in place if ordering matters.
- Always `disconnect()` on SIGTERM.

## Delivery semantics

| | Commit | Crash between steps |
|---|---|---|
| At-most-once | before processing | lost |
| At-least-once | after processing | duplicated → idempotent handler |
| Effectively-once | after processing + dedupe stored atomically with the effect | duplicate detected and skipped |

## Default partitioner

```
partition = (murmur2(utf8(key)) & 0x7fffffff) % numPartitions
seed 0x9747b28c, m 0x5bd1e995, r 24 · use Math.imul · hash UTF-8 bytes
```

## kafkajs quick reference

```ts
kafka.producer({ idempotent: true, createPartitioner: Partitioners.DefaultPartitioner })
producer.send({ topic, acks: -1, messages: [{ key, value, headers }] })   // → RecordMetadata[] per partition

kafka.consumer({ groupId })
consumer.subscribe({ topics: [topic], fromBeginning: true })              // fromBeginning: only if nothing committed
consumer.run({ autoCommit: false, eachMessage: async ({ topic, partition, message }) => { ... } })
consumer.commitOffsets([{ topic, partition, offset: (BigInt(message.offset) + 1n).toString() }])

admin.createTopics({ waitForLeaders: true, topics: [{ topic, numPartitions: 3, replicationFactor: 1 }] })
admin.fetchTopicOffsets(topic)                  // [{ partition, offset, high, low }]
admin.fetchOffsets({ groupId, topics: [topic] }) // [{ topic, partitions: [{ partition, offset: "-1" | "n" }] }]
```

## Which tool?

| Need | Reach for |
|---|---|
| Many services react to the same domain events, replay, high volume | Kafka |
| One app's background jobs with delays, retries, priorities | BullMQ / a job queue |
| Lightweight stream, already running Redis | Redis Streams |
| Complex routing, per-message TTL, classic task distribution | RabbitMQ |
