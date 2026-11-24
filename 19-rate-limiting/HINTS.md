# Hints · Rate Limiting

Open one hint at a time. Give each a real try before opening the next.

## TODO 1: Fixed window

<details><summary>Hint 1</summary>

Compute everything time-related in TypeScript (window number, key name, ms until the window ends) and pass it into the script. The script only needs to do the part that must be atomic: read the counter, decide, increment.
</details>

<details><summary>Hint 2</summary>

Create the script once at module level: `const SCRIPT = new LuaScript(source, 1)`, then `await SCRIPT.run(this.redis, [redisKey], [cost, limit, ttlMs])`. Return a table like `{allowed, count}` from Lua and parse it with `toIntegers(reply, 2)`. `GET` on a missing key gives `false` in Lua, so use `tonumber(redis.call('GET', KEYS[1]) or '0')`.
</details>

<details><summary>Hint 3</summary>

```
count = GET key or 0
if count + cost > limit → return {0, count}       -- no write at all
count = INCRBY key cost
if count == cost → PEXPIRE key ttl                -- first write in this window
return {1, count}
```
Then `remaining = max(0, limit - count)`, `retryAfterMs = allowed ? 0 : resetMs`.
</details>

## TODO 2: Sliding window log

<details><summary>Hint 1</summary>

The sorted set holds one member per allowed unit of cost; the score is the timestamp. The member value just has to be unique. Pass `randomUUID()` in as an argument.
</details>

<details><summary>Hint 2</summary>

Order inside the script: `ZREMRANGEBYSCORE key -inf (now - window)` (inclusive, so an entry exactly `window` old is gone), `ZCARD`, decide, then either `ZADD` + `PEXPIRE` or compute the retry time. For retry with cost 1, the oldest entry is `ZRANGE key 0 0 WITHSCORES`, which returns `{member, score}`.
</details>

<details><summary>Hint 3</summary>

When rejected, you need `needed = count + cost - limit` entries to expire. The last of those is at index `needed - 1` (oldest first): `retry = score_at(needed - 1) + window - now`. `resetMs` is the newest entry (`ZRANGE key -1 -1 WITHSCORES`) + window − now when rejected, and simply `window` right after an allowed request (the newest entry is "now"). Return `{allowed, count, retry, reset}`.
</details>

## TODO 3: Token bucket

<details><summary>Hint 1</summary>

Store two fields in a hash: `tokens` and `ts` (last update time). A missing hash means a full bucket at `now`. Convert `refillPerSecond` to per-millisecond in TypeScript before passing it in.
</details>

<details><summary>Hint 2</summary>

`HMGET key tokens ts` returns `{false, false}` for a new key, and `tonumber(false)` is `nil`, which is easy to test for. Refill: `tokens = math.min(capacity, tokens + math.max(0, now - ts) * rate)`. Always write back the refilled value and `ts = now`, even when rejecting.
</details>

<details><summary>Hint 3</summary>

The fractional-tokens test fails if anything truncates the stored value. Write it with `redis.call('HSET', KEYS[1], 'tokens', tostring(tokens), 'ts', tostring(now))`. Only the *returned* numbers get rounded: `{allowed, math.floor(tokens), math.ceil((cost - tokens) / rate), math.ceil((capacity - tokens) / rate)}` (retry = 0 when allowed). TTL: `math.ceil(capacity / rate)` plus a little slack.
</details>

## TODO 4: Middleware

<details><summary>Hint 1</summary>

Return an `async (req, res, next) => { ... }`. Express 5 forwards a thrown error to the error handler, so for 429 and 503 you can simply `throw new HttpError(...)`.
</details>

<details><summary>Hint 2</summary>

Put *only* the `consume` call inside `try/catch`. If the catch wraps everything, your own `throw new HttpError(429...)` gets caught and turned into a limiter failure.
</details>

<details><summary>Hint 3</summary>

```
try { decision = await limiter.consume(keyFn(req), cost) }
catch (err) { onLimiterError(err, req); if failOpen → next(), return; else throw 503 }
set 3 RateLimit headers (Reset = ceil(resetMs / 1000))
if !allowed → set Retry-After = max(1, ceil(retryAfterMs / 1000)); throw 429
next()
```
</details>

## TODO 5: Keys

<details><summary>Hint 1</summary>

`req.get("x-api-key")` reads the header. Trim it: whitespace-only means "no key".
</details>

<details><summary>Hint 2</summary>

`createHash("sha256").update(value).digest("hex")` from `node:crypto` gives a stable, non-reversible id. For `loginKey`, `req.body` is `unknown`-ish: check it's an object with a string `username` before using it.
</details>
