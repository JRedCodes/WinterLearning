# Choosing a Redis data structure

The lesson introduced each type. This guide is the reference you come back to when designing a feature: what each structure costs, how it's stored, and the patterns built on it.

## Complexity at a glance

| Operation | Command | Cost | Notes |
|---|---|---|---|
| Read/write a string | `GET` / `SET` | O(1) | |
| Counter | `INCR` / `INCRBY` | O(1) | atomic |
| Many strings | `MGET k1..kN` | O(N) | one round trip |
| Hash field | `HGET` / `HSET` | O(1) per field | |
| Whole hash | `HGETALL` | O(fields) | fine for small hashes |
| Push/pop list ends | `LPUSH` / `RPOP` | O(1) | |
| List range | `LRANGE 0 n` | O(n) from the head | O(offset) to reach the start |
| Trim list | `LTRIM` | O(removed) | |
| Set add/check | `SADD` / `SISMEMBER` | O(1) | |
| All set members | `SMEMBERS` | O(N) | use `SSCAN` for big sets |
| Set algebra | `SINTER` | O(N·M) worst case | can be expensive |
| ZSET add/update | `ZADD` / `ZINCRBY` | O(log N) | |
| ZSET top-k | `ZREVRANGE 0 k-1` | O(log N + k) | |
| ZSET rank | `ZRANK` | O(log N) | |
| Stream append | `XADD` | O(1) | plus trimming |
| Stream range | `XRANGE` | O(log N + count) | |
| HLL add/count | `PFADD` / `PFCOUNT` | O(1) | multi-key count merges |
| Bit | `SETBIT` / `GETBIT` | O(1) | |
| Count bits | `BITCOUNT` | O(size) | fast in practice |

The dangerous ones are anything that touches **all** elements of a big key (`SMEMBERS`, `HGETALL`, `LRANGE 0 -1`, `DEL` on a huge key) and anything that touches all **keys** (`KEYS`, `FLUSHALL`). Redis is single-threaded for commands, so an O(N) operation on N = 10 million blocks every client.

## Memory encodings (why small things are cheap)

Redis picks a compact representation for small collections and switches to a full data structure as they grow. Check with `OBJECT ENCODING key`:

| Type | Small encoding | Large encoding |
|---|---|---|
| Hash | `listpack` (a flat array) | `hashtable` |
| List | `listpack` | `quicklist` (linked list of listpacks) |
| Set | `intset` (all integers) / `listpack` | `hashtable` |
| Sorted set | `listpack` | `skiplist` + hashtable |
| String | `int` / `embstr` | `raw` |

Thresholds are configurable (`hash-max-listpack-entries`, etc.). The practical lesson: **many small hashes are very memory-efficient**, which is why "one hash per user" beats "one string key per user field".

## Patterns by structure

### Strings
- **Counter:** `INCR views:{page}`. Add `EXPIRE` for windows (e.g. per-minute counters, which is the start of rate limiting in [module 19](../../19-rate-limiting/README.md)).
- **Cache entry:** `SET product:v1:{id} <json> EX 300` ([module 18](../../18-caching/README.md)).
- **Idempotency marker / dedupe:** `SET processed:{jobId} 1 NX EX 86400`. The first caller gets `OK`, later callers get `nil`.
- **Lock:** `SET lock:{resource} <token> NX PX 30000` + Lua release.

### Hashes
- **Session:** `HSET session:{id} userId .. role ..` + `EXPIRE`.
- **Object with counters:** `HINCRBY post:{id}:stats likes 1`, one key per post rather than one per post per metric.

### Lists
- **Capped recent items:** `LPUSH` + `LTRIM 0 N-1` in `MULTI`.
- **Simple queue:** `LPUSH` / `BRPOP`. For reliability (no lost jobs when a worker crashes), use `LMOVE` into a "processing" list, then remove it when done. Or just use a proper queue library.

### Sets
- **Once-only:** `SADD claimed:{campaign} {user}` → 1 means first.
- **Tagging:** `SADD tag:{tag} {postId}`, then `SINTER tag:redis tag:node` for posts with both tags.
- **Online users:** a set per minute, `SUNION` the last 5 minutes.

### Sorted sets
- **Leaderboard:** score = points.
- **Time index / sliding window:** score = timestamp. `ZRANGEBYSCORE` for a time range, `ZREMRANGEBYSCORE` to drop old entries. This is the "sliding log" rate limiter.
- **Delayed jobs:** score = run-at time, and workers poll for scores ≤ now. BullMQ uses this idea for delayed jobs.
- **Priority queue:** `ZPOPMIN`.

### Streams
- **Event log / audit trail** with bounded length.
- **Work queue with consumer groups:** each message goes to one consumer in the group, must be `XACK`ed, and unacknowledged messages can be claimed by another consumer (`XAUTOCLAIM`) after a timeout.
- **Activity history** readable from any point by id.

### HyperLogLog
- **Unique counts** per day, page or campaign, merged across days with `PFCOUNT k1 k2 ...` or `PFMERGE`.

### Bitmaps
- **Daily active users** with integer ids, cohort retention (`BITOP AND` of two days).

## Lists vs streams vs sorted sets for "recent things"

| Need | Pick |
|---|---|
| Last N items, read newest first, nothing else | List + `LTRIM` |
| Readers resume from where they left off; several independent readers | Stream |
| Range by time, remove arbitrary items, dedupe | Sorted set (score = time) |

## Set vs HyperLogLog vs bitmap for "distinct users"

| | Set | HyperLogLog | Bitmap |
|---|---|---|---|
| Exact? | yes | ~0.81% error | yes |
| Can list members? | yes | no | yes (scan bits) |
| Membership check? | yes | no | yes |
| Memory for 10M ids | hundreds of MB | ~12 KB | ~1.2 MB (dense int ids) |
| Id requirements | any string | any string | small non-negative integers |
