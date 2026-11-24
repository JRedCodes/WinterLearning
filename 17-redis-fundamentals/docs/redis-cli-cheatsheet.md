# redis-cli cheat sheet

```bash
make redis-cli                       # this module: docker compose exec redis redis-cli -n 1
redis-cli -p 6380 -n 1               # local redis-cli against the compose Redis, db 1
redis-cli -u redis://localhost:6380/1
redis-cli -p 6380 -n 1 GET wl:17:views:home   # one-shot command
redis-cli -p 6380 --scan --pattern 'wl:17:*'  # list keys safely (SCAN under the hood)
redis-cli -p 6380 --bigkeys          # find the largest keys per type
redis-cli -p 6380 --latency          # measure round-trip latency
redis-cli -p 6380 MONITOR            # stream every command the server runs (dev only! expensive)
```

## Keys

```text
EXISTS k [k ...]        # how many of these exist
TYPE k                  # string | hash | list | set | zset | stream | none
DEL k [k ...]           # delete (blocking free)
UNLINK k [k ...]        # delete, free memory in background (prefer for big keys)
RENAME k newk
SCAN 0 MATCH wl:17:* COUNT 100   # iterate safely; repeat with returned cursor until 0
KEYS pattern            # O(N) over everything: NEVER in production
SELECT 1                # switch database (0-15)
DBSIZE                  # keys in current db
FLUSHDB                 # wipe current db (careful)
```

## Expiry

```text
SET k v EX 60           # set + TTL in seconds (PX for ms)
SET k v KEEPTTL         # overwrite but keep existing TTL
EXPIRE k 60             # 1 if set, 0 if key missing
PEXPIRE k 5000
TTL k / PTTL k          # -1 no expiry, -2 missing
PERSIST k               # remove TTL
```

## Strings

```text
SET k v [NX|XX] [EX s|PX ms]   # NX = only if absent, XX = only if present
GET k
MGET k1 k2 k3 / MSET k1 v1 k2 v2
INCR k / INCRBY k 5 / DECR k / INCRBYFLOAT k 0.5
GETDEL k / GETEX k EX 60
APPEND k "more" / STRLEN k
```

## Hashes

```text
HSET h f1 v1 f2 v2      # returns number of NEW fields
HGET h f / HMGET h f1 f2
HGETALL h               # {} when missing
HDEL h f / HEXISTS h f / HLEN h
HINCRBY h f 1
HSCAN h 0               # iterate a big hash
```

## Lists

```text
LPUSH l a b c           # head;  RPUSH for tail
LPOP l / RPOP l [count]
LRANGE l 0 -1           # all (stop inclusive, -1 = last)
LTRIM l 0 49            # keep first 50
LLEN l / LINDEX l 0
BRPOP l 5               # block up to 5s waiting for an item
LMOVE src dst LEFT RIGHT  # atomic move (reliable-queue building block)
```

## Sets

```text
SADD s a b              # returns number actually added
SREM s a / SISMEMBER s a / SMISMEMBER s a b
SMEMBERS s              # all (O(N), use SSCAN for big sets)
SCARD s
SINTER s1 s2 / SUNION s1 s2 / SDIFF s1 s2
SRANDMEMBER s 3 / SPOP s
```

## Sorted sets

```text
ZADD z 10 alice 20 bob  # NX/XX/GT/LT options available
ZINCRBY z 5 alice       # returns new score (string)
ZSCORE z alice
ZRANGE z 0 9 REV WITHSCORES      # top 10 (Redis 6.2+ syntax)
ZREVRANGE z 0 9 WITHSCORES       # classic syntax
ZRANK z alice / ZREVRANK z alice # 0-based
ZRANGEBYSCORE z 100 200 / ZRANGE z 100 200 BYSCORE
ZREM z alice / ZCARD z / ZCOUNT z 0 100
ZREMRANGEBYRANK z 0 -101         # keep only the top 100
ZPOPMIN z / ZPOPMAX z
```

## Streams

```text
XADD s MAXLEN ~ 1000 * f1 v1 f2 v2   # auto id
XLEN s
XRANGE s - + COUNT 10                # oldest first
XRANGE s (1718000000000-0 +          # exclusive start
XREVRANGE s + - COUNT 10             # newest first
XREAD COUNT 10 BLOCK 5000 STREAMS s $   # wait for new entries
XGROUP CREATE s workers $ MKSTREAM
XREADGROUP GROUP workers w1 COUNT 10 STREAMS s >
XACK s workers <id>
XPENDING s workers
XTRIM s MAXLEN ~ 1000
```

## HyperLogLog & bitmaps

```text
PFADD h a b c / PFCOUNT h [h2 ...] / PFMERGE dest h1 h2
SETBIT b 1007 1 / GETBIT b 1007 / BITCOUNT b / BITOP AND dest b1 b2
```

## Transactions & scripts

```text
MULTI / ... / EXEC      # queued commands run back to back
DISCARD                 # cancel the queue
WATCH k                 # EXEC returns nil if k changed since WATCH
EVAL "return redis.call('GET', KEYS[1])" 1 mykey
SCRIPT LOAD "..."       # returns sha → EVALSHA sha 1 mykey
```

## Server & diagnostics

```text
PING
INFO [memory|stats|replication|keyspace]
CONFIG GET maxmemory-policy
MEMORY USAGE k
SLOWLOG GET 10
CLIENT LIST
OBJECT ENCODING k       # listpack, hashtable, skiplist, ...
```
