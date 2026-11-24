# Building blocks reference

A quick-reference card for each component you'll draw in a design. For each: **what it's for**, **when to add it**, **numbers to quote**, **how it fails**, and **what to say** about it. The lesson (section 3) explains the concepts; this page is for looking things up while you write designs.

---

## DNS

- **For:** turning names into IP addresses; coarse traffic steering (geo-DNS, failover between regions, weighted records for migrations).
- **Numbers:** lookups are cached by resolvers according to TTL (commonly 60 s – 1 h). A TTL of 60 s means a DNS failover takes at least a minute to reach most clients, often longer because some clients ignore TTLs.
- **Fails:** misconfiguration is a classic cause of global outages; DNS failover is slow.
- **Say:** "Geo-DNS sends users to the nearest region; within a region, a load balancer does the fine-grained routing."

## Load balancer

- **For:** spreading traffic across stateless instances, health checks, TLS termination, routing (L7).
- **Add when:** more than one instance of anything. Always, in practice.
- **Choose:** L4 for raw TCP, long-lived connections, very high throughput; L7 for HTTP routing, header manipulation, retries, canaries.
- **Algorithms:** round robin; least connections (variable request cost); consistent hashing on a key (affinity: WebSockets, cache shards); weighted (canary, mixed instance sizes).
- **Fails:** a misconfigured health check removes every instance; aggressive retries at the LB amplify an overload. The LB tier itself must be redundant.
- **Say:** "Instances are stateless, so the LB can use least-connections and we scale by adding instances. Health checks hit `/readyz` so instances drain before shutdown."

## API gateway

- **For:** one entry point that handles cross-cutting concerns: authentication, rate limiting, request validation, routing to services, API keys, quotas.
- **Add when:** many services, or public APIs with keys and tiers.
- **Fails:** it's on every request's path, so it must be horizontally scaled and boring. Business logic creeping into the gateway is an anti-pattern.

## CDN

- **For:** static assets, media, and cacheable public responses served from edge locations near users.
- **Numbers:** edge hits are often ~10–30 ms versus 100+ ms to a distant origin; offloads the large majority of bytes for media-heavy apps.
- **Patterns:** content-hashed immutable URLs with `Cache-Control: public, max-age=31536000, immutable`; short TTLs (seconds) for semi-dynamic public JSON; signed URLs for private media.
- **Fails:** purges are slow; a cache-key mistake (varying on a cookie) destroys the hit rate; caching a personalized response leaks data between users.

## Cache (Redis / Memcached / in-process)

- **For:** making hot reads cheap and fast; absorbing read load that would otherwise need many DB replicas.
- **Numbers:** Redis ~0.2–1 ms per op over the network, 100k+ ops/s per node; in-process lookups are microseconds.
- **Decide:** pattern (cache-aside is the default), TTL (+ jitter), invalidation (delete on write), key design, negative caching for misses, stampede protection (single-flight / locks / early refresh).
- **Fails:** a flushed cache sends full load to the DB (cold start); stale entries after a write race; hot keys overload one node; memory pressure triggers evictions.
- **Say:** "Cache-aside with a 10-minute TTL plus jitter, invalidated on update. Hit rate should be ~90% given the skew; the DB is sized to survive a cold cache at off-peak, and we shed load if it happens at peak."

## Relational database (Postgres)

- **For:** the source of truth for most business data; transactions; constraints that enforce invariants (unique, foreign keys, check, exclusion).
- **Numbers:** single primary handles thousands to tens of thousands of simple writes/s and more reads; replicas add read capacity; multi-TB on one node is normal.
- **Scale levers in order:** indexes and query fixes (module 14) → connection pooling → caching → read replicas → partitioning big tables → vertical scaling → sharding (or a distributed SQL database).
- **Fails:** primary failure (failover takes seconds to a minute); replication lag; connection exhaustion; long-running transactions blocking vacuum and DDL; lock contention on hot rows.
- **Say:** "Seat inventory lives in Postgres because it needs a transaction and a constraint; one primary handles the ~2k writes/s at the on-sale peak."

## NoSQL stores

| Type | Pick it when | Watch out for |
|---|---|---|
| Key-value (DynamoDB, Redis) | access is by key, huge scale, simple items | design every access pattern up front; secondary indexes cost extra |
| Wide-column (Cassandra, Scylla, Bigtable) | write-heavy, time-ordered data per partition key (messages, events, IoT) | partitions that grow unbounded (bucket by time); no joins; tunable consistency must be chosen per query |
| Document (MongoDB) | self-contained nested documents read and written as a whole | modelling relationships; large documents rewritten on small changes |
| Search (OpenSearch/Elasticsearch) | full-text, relevance, facets, fuzzy matching | it's a derived index, never the source of truth; reindexing cost |
| Graph (Neo4j) | queries are multi-hop traversals ("friends of friends who like X") | most "graphs" (follows) are fine as adjacency tables in SQL |

## Replication

- **Leader–follower:** one writer, many readers. Default.
- **Sync vs async:** sync = no data loss on failover, slower writes; async = fast writes, possible loss of the last writes, replica lag. Common compromise: one synchronous replica plus async ones ("semi-sync").
- **Multi-leader / leaderless:** writes in multiple places; needs conflict resolution. Use for multi-region writes or extreme availability, accepting complexity.
- **Quorums:** N replicas, W write acks, R read replicas. R + W > N ⇒ reads see the latest write (in the absence of sloppy quorums and failures).
- **Say:** "Reads that must reflect the user's own writes go to the primary; everything else can use replicas, which lag by well under a second normally."

## Partitioning / sharding

- **Choose the key** so that (1) load spreads evenly, (2) one request touches one shard, (3) there's no natural hot spot.
- **Hash** for even spread; **range** for range scans (beware time-based hot spots); **directory** for flexibility.
- **Costs:** cross-shard queries and transactions, global unique constraints, rebalancing, operational load.
- **Hot keys:** cache them, split them (`key#0..9`), or route them specially.
- **Say:** "Messages are partitioned by `conversation_id`, so loading a chat is a single-partition range read ordered by message sequence."

## Consistent hashing

- Keys and nodes on a ring; a key belongs to the next node clockwise; adding or removing a node moves ~1/N of keys.
- **Virtual nodes** (100–200 per physical node) smooth out the distribution and allow weighting.
- Used by Cassandra/Dynamo-style stores, cache client libraries, and L7 balancers wanting affinity.
- **Say:** "Cache nodes are selected by consistent hashing, so scaling the cache tier from 8 to 10 nodes only invalidates ~20% of keys."

## Message queue / stream

- **Job queue** (BullMQ, SQS, RabbitMQ): units of work, each processed by one worker, deleted on success, retries and DLQ built in.
- **Log/stream** (Kafka, Redis Streams, Kinesis): ordered, replayable, many independent consumer groups, ordering per partition.
- **Numbers:** Redis-based queues comfortably do thousands of jobs/s; Kafka clusters do millions of messages/s.
- **Always mention:** at-least-once delivery ⇒ idempotent consumers; DLQ after N attempts; backoff with jitter; consumer lag as the key metric; partition key for ordering.
- **Fails:** consumers fall behind (lag grows, memory/disk fills); poison messages block a partition; duplicates on redelivery.

## Object storage

- **For:** blobs: images, video, backups, exports, logs, ML artifacts.
- **Numbers:** effectively unlimited capacity; very high durability; first-byte latency tens of ms (put a CDN in front for user-facing reads).
- **Patterns:** pre-signed URLs for direct client upload/download; lifecycle rules to move old objects to cheaper tiers; event notifications to trigger processing (thumbnails, transcoding).
- **Fails:** rarely; the usual mistakes are public buckets and proxying large files through your API.

## Search index

- **For:** text search, relevance ranking, typo tolerance, facets, geo queries.
- **Feeding it:** asynchronously from the source of truth (outbox or CDC), with a full reindex job for schema changes.
- **Say:** "Search results may lag writes by about a second, which is acceptable for product search; the product page itself reads from Postgres."

## Unique IDs

| Option | Ordered | Coordination | Size | Notes |
|---|---|---|---|---|
| DB sequence | yes | central DB | 8 B | simplest; guessable |
| UUIDv4 | no | none | 16 B | random index inserts hurt B-tree locality |
| UUIDv7 / ULID | roughly by time | none | 16 B | good default for distributed inserts |
| Snowflake (time + machine + seq) | roughly by time | machine ids | 8 B | needs clock discipline |
| Leased ranges | per server | occasional | 8 B | good for short codes at high write rates |

## Workers and schedulers

- **For:** anything slow, retryable or periodic: emails, thumbnails, aggregations, cleanups, hold expiry.
- **Say:** "The expiry sweeper runs every few seconds and releases holds older than 10 minutes with a single conditional UPDATE, so running two sweepers at once is harmless."

## Real-time delivery

- **Polling / long polling / SSE / WebSockets** (module 28). WebSocket gateways are stateful: route messages to the right gateway via a connection registry or pub/sub, and handle reconnects with resume-from-last-id.
- **Mobile push** (APNs/FCM) for users who aren't connected.

## Observability (always part of the design)

- **Metrics:** RED (rate, errors, duration) per endpoint; USE for resources; queue lag; cache hit rate.
- **Logs** with request ids; **traces** across services.
- **SLOs** and alerts on symptoms (error rate, latency), not causes (CPU).
- **Say:** "We alert on redirect p99 and 5xx rate against the SLO, and on consumer lag for the aggregator."
