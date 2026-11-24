# Persistence, memory and eviction

These are the settings that decide whether Redis loses your data, and what it throws away when it runs out of RAM. You'll often configure them through a managed service's console rather than a `redis.conf`, but the concepts are identical.

## Persistence options

### RDB snapshots

```conf
save 900 1      # snapshot if >= 1 change in 15 min
save 300 10     # or >= 10 changes in 5 min
save 60 10000   # or >= 10000 changes in 1 min
```

Redis `fork()`s, and the child writes the whole dataset to `dump.rdb` while the parent keeps serving requests. Copy-on-write means memory is shared until the parent modifies pages, so a write-heavy instance can briefly need up to ~2× memory during a snapshot. Leave headroom.

- ✅ Compact, single-file backups. Fast restarts.
- ❌ You lose everything written since the last snapshot.

### AOF (append-only file)

```conf
appendonly yes
appendfsync everysec    # always | everysec | no
```

Every write command is appended to a log, which Redis replays on startup.

| `appendfsync` | Durability | Speed |
|---|---|---|
| `always` | fsync every write: lose almost nothing | slowest |
| `everysec` | lose up to ~1 s | the usual default |
| `no` | the OS decides (often ~30 s) | fastest |

The AOF grows forever, so Redis periodically **rewrites** it in the background into the minimal set of commands that recreates the current state.

### Both

`appendonly yes` plus `save` rules: the AOF for durability, RDB for backups. Redis 7 combines them in a multi-part AOF with an RDB base file.

### None

A pure cache doesn't need persistence. After a restart it starts cold, and the database absorbs the load until the cache warms up. Plan for that "cold cache" moment ([module 18](../../18-caching/README.md)).

## Replication is not a backup

Replicas copy the primary **asynchronously**. They protect you against a machine dying (failover), not against `FLUSHALL` or a buggy deploy, because those replicate too. Take RDB backups if the data matters.

## Memory

```text
INFO memory
  used_memory_human: 1.20G
  maxmemory_human: 2.00G
  mem_fragmentation_ratio: 1.12
MEMORY USAGE wl:17:leaderboard:weekly
redis-cli --bigkeys
```

- **Set `maxmemory`.** Without it, Redis grows until the OS kills it.
- **Fragmentation ratio** well above 1.5 means the allocator is holding freed memory. `activedefrag yes` helps.
- **Big keys** are the classic operational hazard: one 2 GB sorted set blocks the server while it's deleted (use `UNLINK`) and can't be spread across cluster nodes. Split by time or id range (`events:2026-01-15`, `feed:{user}`).
- **TTL everything that's derived.** Caches, sessions, rate-limit windows. Unbounded growth is usually "we forgot a TTL" or "we forgot `LTRIM`/`MAXLEN`".

## Eviction policies

When `maxmemory` is reached and a write needs memory:

| Policy | Candidates | Picks |
|---|---|---|
| `noeviction` | (none) | rejects the write with an OOM error |
| `allkeys-lru` | all keys | least recently used |
| `allkeys-lfu` | all keys | least frequently used |
| `allkeys-random` | all keys | random |
| `volatile-lru` | keys with a TTL | least recently used |
| `volatile-lfu` | keys with a TTL | least frequently used |
| `volatile-random` | keys with a TTL | random |
| `volatile-ttl` | keys with a TTL | shortest remaining TTL |

LRU and LFU are **approximate**: Redis samples a handful of keys (`maxmemory-samples`, default 5) and evicts the best candidate among them. That's cheap and close enough to exact.

### Choosing

- **Dedicated cache:** `allkeys-lru`, or `allkeys-lfu` if you have a stable set of hot keys and occasional scans that would pollute an LRU.
- **Queues, locks, sessions, anything you can't silently lose:** `noeviction`, and alert on memory well before the limit. An OOM error is loud. A silently evicted job is not.
- **Mixed instance:** `volatile-lru`, with TTLs on cache keys only. It's fragile: one forgotten TTL on a cache key and that key can never be evicted, while one TTL on a "durable" key makes it evictable. Separate instances are cleaner.

## A sensible starting point per role

| Role | Persistence | Eviction | Notes |
|---|---|---|---|
| Cache | none or RDB | `allkeys-lru` | cold-start plan |
| Sessions | AOF everysec | `noeviction` or `volatile-lru` | losing them logs users out |
| Job queue (BullMQ) | AOF everysec | `noeviction` (BullMQ requires it) | alert on memory |
| Rate limiting | none | `allkeys-lru` / `volatile-ttl` | losing counters briefly is acceptable |
| Leaderboard (derived) | RDB | `noeviction` | can rebuild from the DB |
