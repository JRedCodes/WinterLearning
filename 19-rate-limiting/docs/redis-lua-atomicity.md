# Redis + Lua: making multi-step logic atomic

Rate limiting is the classic first use of Redis scripting, but the pattern applies anywhere you need "read, decide, write" on shared state: inventory holds, idempotency keys, leaky counters, distributed locks (module 17).

## Why single commands aren't enough

Redis executes commands one at a time on a single thread, so each command is atomic. But a *client-side* sequence is not:

```ts
const tokens = await redis.hget(key, "tokens");   // 1
// ...other clients' commands can run here...
await redis.hset(key, "tokens", tokens - 1);      // 2
```

Between 1 and 2, any number of other clients can read the same value and make the same decision. Under load that's not a rare edge case: it's every burst.

## Your options

| Approach | Atomic? | Can branch on read values? | Round trips | Notes |
|---|---|---|---|---|
| Separate commands | ❌ | yes | many | racy |
| Pipeline | ❌ | no | 1 | batches commands but others can interleave between them |
| `MULTI` / `EXEC` | ✅ | ❌ | 1–2 | queued commands run together, but you can't use a result inside the transaction |
| `WATCH` + `MULTI` | ✅ (optimistic) | yes | 2+ | aborts if the key changed; you retry. Retries pile up under contention |
| **Lua script** | ✅ | ✅ | 1 | the right tool for small read-decide-write logic |
| Redis Functions (7.0+) | ✅ | ✅ | 1 | scripts loaded once as a named library (`FUNCTION LOAD`, `FCALL`); same semantics, better lifecycle |

## Anatomy of a script call

```
EVAL "<lua source>" 1 wl:19:rl:tb:alice 1700000000000 5 0.005 1
                    │ └── KEYS[1]       └── ARGV[1]   ARGV[2..4]
                    └── number of keys
```

- `KEYS` are the Redis keys the script touches. Declare all of them. In Redis Cluster all keys of one script must hash to the same slot (use `{hash tags}` if you need several related keys).
- `ARGV` are plain arguments. **They're strings.** `tonumber()` them.
- `redis.call(...)` runs a command and raises an error on failure. `redis.pcall(...)` returns the error instead.
- The return value is converted: Lua number → integer (**truncated**), string → bulk string, table → array, `false`/`nil` → nil, `true` → 1.

## EVALSHA and the script cache

```ts
const sha = sha1(source);
try {
  return await redis.evalsha(sha, 1, key, ...args);
} catch (err) {
  if (String(err).includes("NOSCRIPT")) return await redis.eval(source, 1, key, ...args);
  throw err;
}
```

Redis keeps every script it has run in a cache, keyed by SHA1. The cache is lost on restart (and on `SCRIPT FLUSH`), so the fallback is required. ioredis's `redis.defineCommand(name, { numberOfKeys, lua })` wraps exactly this logic; the challenge spells it out in `src/lib/script.ts` so nothing is magic.

## Rules for well-behaved scripts

1. **Short and bounded.** A script blocks the whole server while it runs. `ZREMRANGEBYSCORE` on a sorted set with a handful of entries is fine. Looping over a million members is an outage. The default `busy-reply-threshold` (formerly `lua-time-limit`) is 5 seconds, after which Redis starts answering other clients with `BUSY` errors.
2. **Deterministic writes.** Since Redis 5, scripts are replicated as the commands they produce ("effects replication"), so calling `TIME` inside a script is allowed. It's still good practice to pass time in as an argument: it makes scripts testable and replica-agnostic.
3. **No hidden keys.** Don't build key names inside the script from `ARGV`. It works on one node and breaks under Cluster.
4. **Return integers.** If you need a fraction, return it scaled (milliseconds, or ×1000) or as a string with `tostring()`.
5. **Set TTLs inside the script**, in the same atomic step as the write that creates the key, so a crash can't leave a key without expiry.

## Debugging scripts

- Run them in `redis-cli`: `redis-cli -n 3 EVAL "$(cat script.lua)" 1 mykey 123 5`.
- `redis.log(redis.LOG_WARNING, "tokens=" .. tokens)` writes to the Redis server log.
- Errors come back with the line number: `ERR user_script:7: attempt to compare number with nil`. That one almost always means a missing `tonumber()` or a `nil` from `GET`.
- `SCRIPT EXISTS <sha>` tells you whether a script is cached.

## Testing scripts deterministically

Inject the clock. When `now` comes from the caller, a test can write:

```ts
const clock = { now: 1_700_000_000_000 };
const limiter = new TokenBucketLimiter({ redis, clock: () => clock.now, capacity: 2, refillPerSecond: 2 });
await limiter.consume("a"); await limiter.consume("a");
clock.now += 499;  expect((await limiter.consume("a")).allowed).toBe(false);
clock.now += 1;    expect((await limiter.consume("a")).allowed).toBe(true);
```

No `sleep`, no flakiness, millisecond-exact assertions. The one thing the fake clock doesn't control is Redis's own TTL countdown, which runs on real time. That's why tests check that a TTL *exists and is sane* rather than waiting for expiry.
