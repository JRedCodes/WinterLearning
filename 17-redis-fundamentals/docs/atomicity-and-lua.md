# Atomicity in Redis: commands, MULTI, WATCH and Lua

"Is this safe if two requests do it at the same time?" is the question to ask about every Redis operation you write. This doc is a deeper look at the four tools you have and how to pick one.

## Level 0: one command

Redis runs commands one at a time, so any single command is atomic. Before reaching for anything fancier, check whether one command already does what you need:

| You want | Single command |
|---|---|
| Increment a counter | `INCR` / `INCRBY` / `HINCRBY` / `ZINCRBY` |
| Set only if absent (lock, dedupe) | `SET k v NX PX ms` |
| Add to a set and learn if it was new | `SADD` (reply 1 or 0) |
| Read and delete | `GETDEL` |
| Read and refresh TTL | `GETEX k EX 60` |
| Move between lists atomically | `LMOVE` |
| Add to a ZSET only if the score is higher | `ZADD k GT score member` |
| Set many keys only if none exist | `MSETNX` |

This covers a surprising share of real needs.

## Level 1: MULTI/EXEC, for writes that belong together

```text
MULTI
LPUSH feed:7 "{...}"
LTRIM feed:7 0 49
EXEC
```

Guarantees:
- The queued commands execute **consecutively**. No other client's command runs in between.
- If the connection drops before `EXEC`, **nothing** runs.

Non-guarantees:
- **No rollback.** If a command fails at runtime (wrong type, for example), the others still apply. Errors are reported per command: in ioredis, `exec()` resolves to `[[err, reply], ...]`, and you must check each `err` yourself.
- **No reads that influence writes.** Every reply arrives only after `EXEC`, so you can't use one inside the transaction.

Syntax errors detected while queueing (unknown command, wrong number of args) make `EXEC` abort the whole transaction.

## Level 2: WATCH, optimistic check-and-set

```text
WATCH balance:7
GET balance:7            → "100"
# app decides: 100 - 30 = 70
MULTI
SET balance:7 70
EXEC                     → nil if balance:7 changed since WATCH; retry
```

In ioredis:

```ts
async function withdraw(redis: Redis, key: string, amount: number) {
  for (let attempt = 0; attempt < 5; attempt++) {
    await redis.watch(key);
    const balance = Number((await redis.get(key)) ?? 0);
    if (balance < amount) {
      await redis.unwatch();
      return false;
    }
    const res = await redis.multi().set(key, balance - amount).exec();
    if (res !== null) return true; // committed
    // null: someone changed the key, loop and retry
  }
  throw new Error("too much contention");
}
```

`WATCH` is per **connection**. With a shared client that many concurrent requests use, one request's `WATCH` affects the others' `MULTI` on the same connection. In practice, `WATCH` needs a dedicated connection per operation, which is one more reason to prefer Lua.

## Level 3: Lua scripts, arbitrary atomic logic

```lua
-- Limited coupon: KEYS[1] = claimed set, ARGV[1] = user, ARGV[2] = limit
if redis.call("SISMEMBER", KEYS[1], ARGV[1]) == 1 then return "already_claimed" end
if redis.call("SCARD", KEYS[1]) >= tonumber(ARGV[2]) then return "sold_out" end
redis.call("SADD", KEYS[1], ARGV[1])
return "claimed"
```

The script runs to completion with nothing else in between. You can read, branch and write. No retries, no extra round trips.

### Type conversions between Lua and Redis

| Redis reply | Lua value |
|---|---|
| integer | number |
| bulk string | string |
| nil (missing) | `false` (not `nil`!) |
| array | table |
| status `OK` | table `{ok="OK"}` |

| Lua return | Redis reply |
|---|---|
| number | integer (**decimals are truncated**: return floats as strings) |
| string | bulk string |
| `true` | integer 1 |
| `false` / `nil` | nil |
| table (array) | array |

The `false`-for-missing rule bites people: `if redis.call("GET", k) == nil` never matches. Compare with `false`, or check the value directly.

### Script hygiene

- **All keys in `KEYS`.** Required for Redis Cluster routing, and it documents what the script touches.
- **Deterministic and short.** It blocks the server while it runs. There's a `busy-script` timeout after which Redis starts answering other clients with `BUSY` errors.
- **No external I/O.** Scripts can't call HTTP or read files. They only see Redis.
- **Load once, call by SHA.** `SCRIPT LOAD` → `EVALSHA`. ioredis's `defineCommand` handles this:

```ts
redis.defineCommand("claimLimited", { numberOfKeys: 1, lua: CLAIM_SCRIPT });
// TypeScript doesn't know about custom commands; declare them via module augmentation
// or call through a small typed wrapper.
```

## Distributed locks: what the simple version does and doesn't give you

The challenge's lock is the single-instance pattern:

1. Acquire: `SET lock:x <random token> NX PX <ttl>`.
2. Do the work.
3. Release: Lua compare-and-delete with the token.

Why each piece exists:

| Piece | Prevents |
|---|---|
| `NX` | Two holders at once |
| `PX ttl` | A crashed holder blocking everyone forever |
| Random token | Deleting a lock you no longer own |
| Lua release | The expire-between-GET-and-DEL race |

What it **doesn't** prevent:

- **Process pauses.** A holder pauses (GC, a VM migration, a slow network) for longer than the TTL, the lock expires, someone else acquires it, and then the first holder wakes up and keeps working. Two holders now act at once. A *fencing token* fixes this: a number that increases every time the lock is acquired (`INCR`), which the protected resource (say, the database) checks and rejects if it's older than one it has already seen.
- **Failover.** Replication is asynchronous. The primary can acknowledge your `SET`, crash before replicating it, and the promoted replica has no lock.

Multi-node algorithms like Redlock try to address failover, and their safety under real-world timing assumptions is debated among distributed-systems experts. The pragmatic rule: use Redis locks to **avoid duplicate work** (two workers generating the same report). For **correctness** (no double-spend, no overselling), rely on the database: constraints, row locks, conditional updates. [Module 15](../../15-transactions-concurrency/README.md) covers those.

## Decision table

| Situation | Tool |
|---|---|
| One command does it | Just the command |
| Several writes must happen together | `MULTI`/`EXEC` (or one command with options, like `SET .. EX`) |
| Read → decide → write, low contention, dedicated connection | `WATCH` + `MULTI` |
| Read → decide → write, anything else | Lua script |
| Must hold across many seconds of app work | Lock (with TTL + token) and an idempotent job |
