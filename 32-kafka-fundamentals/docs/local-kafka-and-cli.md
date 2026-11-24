# Local Kafka and the CLI tools

## The compose file, line by line

```yaml
kafka:
  image: apache/kafka:3.9.0
  ports: ["9092:9092"]
  environment:
    KAFKA_NODE_ID: 1
    KAFKA_PROCESS_ROLES: broker,controller
```

**KRaft combined mode**: one process is both a *broker* (stores partitions, serves clients) and a *controller* (manages metadata: topics, leaders, configs). In production these are usually separate nodes, with 3 or 5 controllers forming a Raft quorum.

```yaml
    KAFKA_LISTENERS: PLAINTEXT://:9092,CONTROLLER://:9093
    KAFKA_ADVERTISED_LISTENERS: PLAINTEXT://localhost:9092
    KAFKA_CONTROLLER_LISTENER_NAMES: CONTROLLER
    KAFKA_LISTENER_SECURITY_PROTOCOL_MAP: CONTROLLER:PLAINTEXT,PLAINTEXT:PLAINTEXT
    KAFKA_CONTROLLER_QUORUM_VOTERS: 1@localhost:9093
```

**Listeners are the #1 local Kafka gotcha.** Connecting to Kafka is a two-step dance:

1. The client connects to a *bootstrap* address (`localhost:9092`) and asks for cluster metadata.
2. The broker replies: "partition 0's leader is broker 1, reachable at **`<advertised listener>`**". The client then connects *there*.

`LISTENERS` is where the broker binds inside the container. `ADVERTISED_LISTENERS` is what it tells clients. If the advertised address isn't reachable from the client (say it advertises the container's hostname `kafka:9092` and your app runs on your laptop), the bootstrap step works and then everything fails. Symptom: "connected, then timeouts / `ENOTFOUND kafka`". When an app runs *inside* the compose network you need a second listener advertised as `kafka:29092`. Our apps run on the host, so `localhost:9092` is right.

The `CONTROLLER` listener on 9093 is for controller ↔ controller (Raft) traffic. `QUORUM_VOTERS` lists the controllers: just us, node 1.

```yaml
    KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR: 1
    KAFKA_TRANSACTION_STATE_LOG_REPLICATION_FACTOR: 1
    KAFKA_TRANSACTION_STATE_LOG_MIN_ISR: 1
```

Kafka's internal topics (`__consumer_offsets`, `__transaction_state`) default to 3 replicas. With one broker they can't be created, and consumer groups simply don't work. Set them to 1 locally.

```yaml
    KAFKA_GROUP_INITIAL_REBALANCE_DELAY_MS: 0
    KAFKA_NUM_PARTITIONS: 3
```

The initial rebalance delay (default 3s) makes the first consumer of a new group wait for others to join. That's good in production, annoying in tests. `NUM_PARTITIONS` is the default for auto-created topics.

```yaml
  healthcheck:
    test: ["CMD-SHELL", "/opt/kafka/bin/kafka-broker-api-versions.sh --bootstrap-server localhost:9092 > /dev/null 2>&1"]
```

The port opening isn't the same as the broker being ready. `kafka-broker-api-versions.sh` performs a real protocol request, so `docker compose up --wait` (what `make up` runs) returns only once clients can talk to the broker.

## CLI lab (15 minutes, worth it)

Run these with the broker up. Prefix every command with `docker compose exec kafka /opt/kafka/bin/`.

**1. Create a topic and look at it**

```bash
kafka-topics.sh --bootstrap-server localhost:9092 --create --topic lab --partitions 3 --replication-factor 1
kafka-topics.sh --bootstrap-server localhost:9092 --describe --topic lab
# Partition: 0  Leader: 1  Replicas: 1  Isr: 1   ← one broker, so leader = only replica
```

**2. Produce keyed records** (type lines, Ctrl-D to stop)

```bash
docker compose exec -it kafka /opt/kafka/bin/kafka-console-producer.sh --bootstrap-server localhost:9092 \
  --topic lab --property parse.key=true --property key.separator=:
a:first
b:second
a:third
```

**3. Consume and see partitions and offsets**

```bash
kafka-console-consumer.sh --bootstrap-server localhost:9092 --topic lab --from-beginning \
  --property print.key=true --property print.partition=true --property print.offset=true --timeout-ms 5000
```

Notice both `a` records are on the same partition, in order. Is `b` on a different one? Compare with `partitionFor("a", 3)` from your TODO 1.

**4. Consumer groups and lag**

```bash
kafka-console-consumer.sh --bootstrap-server localhost:9092 --topic lab --group lab-readers --from-beginning --timeout-ms 5000
kafka-consumer-groups.sh --bootstrap-server localhost:9092 --describe --group lab-readers   # LAG 0
# produce two more records (step 2), then describe again: LAG 2 on some partition
```

**5. Replay**: rewind the group (it must have no active members)

```bash
kafka-consumer-groups.sh --bootstrap-server localhost:9092 --group lab-readers --topic lab --reset-offsets --to-earliest --execute
```

Re-run the consumer from step 4 and everything comes back. This is how you rebuild a projection after fixing a bug.

**6. Compaction**

```bash
kafka-topics.sh --bootstrap-server localhost:9092 --create --topic lab-state --partitions 1 --replication-factor 1 \
  --config cleanup.policy=compact --config segment.ms=1000 --config min.cleanable.dirty.ratio=0.01
```

Produce `k1:A`, `k1:B`, `k2:C`, `k1:D`, wait a bit, produce one more record, and consume from the beginning. Older `k1` values eventually disappear. (Compaction runs in the background on closed segments, so it isn't instant.)

## Running the challenge against the real broker

```bash
make up
make test-integration     # same classes, real Kafka (unique topic per run, cleaned up afterwards)
make dev                  # projection worker; logs lag + totals every 5s
make produce              # in another terminal
make groups               # watch CURRENT-OFFSET catch up to LOG-END-OFFSET
```

Stop the worker with Ctrl-C and watch it leave the group cleanly. Then start two workers in two terminals and run `make groups` to see the partitions split between them.

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| `make up` hangs, then fails | port 9092 already used (another Kafka?) → `lsof -i :9092` |
| Client connects, then `ENOTFOUND` / timeouts | advertised listener not reachable from where the client runs |
| Consumer never receives anything | different `groupId` already committed at the end; or `fromBeginning: false` on a new group with old data; or a typo in the topic name (auto-creation hides it!) |
| "The group is rebalancing" errors in a loop | handler slower than the session timeout; two processes with the same group subscribing to different topics |
| `There is no leader for this topic-partition` right after creating a topic | metadata not propagated yet; kafkajs retries, or create with `waitForLeaders: true` |
| Data survives `make down` | it shouldn't: there's no volume, so data lives in the container. `make reset` removes everything |
