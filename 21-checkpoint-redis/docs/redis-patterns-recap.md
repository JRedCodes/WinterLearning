# Redis patterns recap (modules 17–21)

A one-page reminder of the Redis patterns from this phase and the command or library feature behind each.

| Pattern | Use it for | Core commands / API | Gotcha |
|---|---|---|---|
| Counter | page views, rate limits | `INCR`, `INCRBY`, `PEXPIRE` | set the TTL atomically (Lua) or keys live forever |
| Cache-aside | read-heavy data | `GET`, `SET key val EX ttl` | the database is the source of truth; add jitter to TTLs |
| Negative cache | repeated misses | `SET key "__none__" EX short` | keep the TTL short |
| Request coalescing | stampedes | in-process promise map, or a lock key | a lock needs a lease (`PX`) |
| Distributed lock | one-at-a-time work | `SET key token NX PX ms` + Lua compare-and-delete | locks expire; fencing tokens for correctness-critical work |
| Idempotency / processed keys | at-least-once consumers | `SET key in-progress NX PX`, then `SET key done PX` | key by business fact, not message id |
| Fixed window limit | simple quotas | `INCR` + `PEXPIRE` in Lua | 2× burst at boundaries |
| Sliding log limit | exact low limits | `ZADD`, `ZREMRANGEBYSCORE`, `ZCARD` | O(limit) memory |
| Token bucket | burst + sustained rate | hash `{tokens, ts}` + Lua | Lua floats are truncated in replies |
| Leaderboard | rankings | `ZINCRBY`, `ZREVRANGE ... WITHSCORES`, `ZREVRANK` | ties ordered lexicographically |
| Unique count | visitors | `PFADD`, `PFCOUNT` | approximate (~0.81% error) |
| Capped list | recent activity | `LPUSH` + `LTRIM` | do both in one `MULTI` |
| Job queue | background work | BullMQ (lists/zsets/hashes + Lua) | `noeviction` + AOF on queue Redis |
| Dedupe on enqueue | one job per entity | BullMQ `jobId` | holds only while the job is retained |

## Keys

- Prefix everything: `<app>:<env or namespace>:<type>:<id>`. Here: `wl:21:<namespace>:...`.
- Hash long or unsafe identifiers (URLs, emails, API keys) into fixed-length hex.
- Use `SCAN`, never `KEYS`, outside a toy setup.

## Atomicity ladder

1. Single command (`INCR`, `SET NX`): always atomic.
2. `MULTI/EXEC`: atomic batch, no branching on reads.
3. Lua script: atomic read-decide-write, one round trip.
4. Anything spanning Redis **and** another system (Postgres, an email API): not atomic. Design for retries and idempotency (and the outbox pattern, module 33).

## Choosing ioredis options

| Situation | Option |
|---|---|
| Fail fast when Redis is down (limiters, caches) | `enableOfflineQueue: false`, low `maxRetriesPerRequest` |
| BullMQ worker connection | pass options, let BullMQ set `maxRetriesPerRequest: null` |
| Scripts and tests | `lazyConnect: true` + explicit `await connect()` |
