# Redis cheat sheet (Redis 7 + ioredis)

> Data structures, the commands for each, and the patterns used in this course. Taught in [17 · Redis Fundamentals](../../17-redis-fundamentals/README.md), used in [18](../../18-caching/README.md), [19](../../19-rate-limiting/README.md), [20](../../20-background-jobs/README.md), [22](../../22-auth/README.md) and [28](../../28-realtime/README.md).

## Connect

```bash
make redis-cli                                       # where the module's Makefile has it
docker compose exec redis redis-cli -n 1             # -n = database index
redis-cli -p 6380 -n 1                               # local client, host port 6380
```

**Repo conventions:** host port **6380**; each module uses DB index `NN mod 16` (module 18 → `/2`) and prefixes keys `wl:NN:` (e.g. `wl:18:product:42`).

```ts
import { Redis } from "ioredis";
const redis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6380/2");
await redis.quit();   // on shutdown, or the process won't exit
```

## Keys & expiry

```
SET wl:17:k v EX 60            # set with 60s TTL
SET wl:17:k v NX PX 30000      # only if absent, 30s TTL (lock / dedupe)
GET wl:17:k
DEL wl:17:k                    # UNLINK for big values (non-blocking free)
EXISTS wl:17:k
EXPIRE wl:17:k 300             # (re)set TTL
TTL wl:17:k                    # -1 = no TTL, -2 = key missing
TYPE wl:17:k
SCAN 0 MATCH wl:17:* COUNT 100 # iterate keys safely (never KEYS * in prod)
```

## Data structures

| Type | Commands | Use it for |
|---|---|---|
| **String** | `SET GET INCR INCRBY DECR MGET SETEX` | cache values, counters, flags, locks |
| **Hash** | `HSET HGET HGETALL HINCRBY HDEL` | objects: sessions, user profile fields |
| **List** | `LPUSH RPUSH LPOP BRPOP LRANGE LTRIM LLEN` | recent-activity feeds, simple queues |
| **Set** | `SADD SREM SISMEMBER SMEMBERS SCARD SINTER` | unique membership, "claimed once", tags |
| **Sorted set** | `ZADD ZINCRBY ZRANGE ... REV WITHSCORES ZRANK ZREMRANGEBYSCORE ZCARD` | leaderboards, sliding-window rate limits, scheduling |
| **Stream** | `XADD XREAD XREADGROUP XACK XRANGE XLEN` | durable-ish event logs with consumer groups |
| **HyperLogLog** | `PFADD PFCOUNT PFMERGE` | approximate unique counts in ~12KB |
| **Bitmap** | `SETBIT GETBIT BITCOUNT` | per-day active flags by numeric id |
| **Pub/Sub** | `PUBLISH SUBSCRIBE PSUBSCRIBE` | fire-and-forget fan-out (module 28) |

## Patterns from the course

```ts
// counter
await redis.incr("wl:17:views:page:home");

// session hash with TTL
await redis.multi().hset("wl:22:sess:abc", { userId: "42", role: "admin" }).expire("wl:22:sess:abc", 1800).exec();

// capped feed: newest first, keep 50
await redis.multi().lpush("wl:28:room:general", msg).ltrim("wl:28:room:general", 0, 49).exec();

// leaderboard top 10
await redis.zincrby("wl:17:lb", 5, "alice");
await redis.zrange("wl:17:lb", 0, 9, "REV", "WITHSCORES");

// cache-aside with TTL + jitter
const hit = await redis.get(key);
if (hit !== null) return JSON.parse(hit);
const value = await repo.find(id);
await redis.set(key, JSON.stringify(value), "EX", 300 + Math.floor(Math.random() * 30));

// lock: acquire with a unique token, release only if we still own it
const token = crypto.randomUUID();
const ok = await redis.set("wl:17:lock:report", token, "PX", 10_000, "NX");   // "OK" or null
await redis.eval(
  `if redis.call("GET", KEYS[1]) == ARGV[1] then return redis.call("DEL", KEYS[1]) else return 0 end`,
  1, "wl:17:lock:report", token,
);
```

## Atomicity toolbox

| Tool | Guarantee | Caveat |
|---|---|---|
| Single command | atomic | `INCR`, `SET NX`, `ZADD` are already safe under concurrency |
| `MULTI` / `EXEC` | queued commands run together, no interleaving | no conditional logic; a failing command doesn't roll back others |
| Pipeline | fewer round trips | **not** atomic, just batched |
| `WATCH` + `MULTI` | optimistic check-and-set | retry on `null` result |
| Lua (`EVAL`, `defineCommand`) | whole script atomic, can branch | keep it short: blocks the server while running |

```ts
redis.defineCommand("takeToken", { numberOfKeys: 1, lua: "-- token bucket script" });
```

## Ops & debugging

```
INFO memory                    # used_memory_human, maxmemory, evicted_keys
INFO stats                     # keyspace_hits / keyspace_misses
DBSIZE
MEMORY USAGE wl:18:product:42
SLOWLOG GET 10
MONITOR                        # print every command (dev only; heavy)
CONFIG GET maxmemory-policy    # e.g. allkeys-lru, volatile-ttl, noeviction
FLUSHDB                        # wipe current DB index only (dev/tests)
```

## Gotchas

- `KEYS *` blocks the server on big datasets. Use `SCAN`.
- Redis is in-memory first: with eviction on, cached keys can vanish any time. Never store the only copy of important data unless persistence (AOF) is configured and you accept the trade-offs.
- `FLUSHALL` wipes every DB index, including other modules'. Tests should delete by prefix or use `FLUSHDB` on their own index.
- A key without a TTL lives forever. Give cache keys a TTL.
- Pub/Sub messages are lost if no subscriber is connected. Use Streams if you need replay.
- A subscribed ioredis connection can't run normal commands; use a second connection.
- `GET` returns `null` for missing keys; distinguish that from a cached "not found" marker (negative caching).
- Big values (MBs) and big collections (millions of members) cause latency spikes. Split them.
