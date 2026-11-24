# Hints · Redis Fundamentals

Open one hint at a time. Give each a real try before opening the next. `make redis-cli` is your best debugging tool: look at what your code actually wrote.

## Exercise 1: Page views

<details><summary>Hint 1</summary>

ioredis has a method for every command, named after it in lowercase: `redis.incr(...)`, `redis.get(...)`, `redis.mget(...)`.
</details>

<details><summary>Hint 2</summary>

`INCR` already returns the new value and treats a missing key as 0. `GET` returns `string | null`, so convert it. `MGET` takes many keys and returns values in the same order, with `null` for missing ones.
</details>

<details><summary>Hint 3</summary>

`getViewsMany`: return `{}` early for an empty array. Otherwise `redis.mget(...ids.map(viewsKey))`, then walk `ids` with their index to build the result object, using 0 for `null`.
</details>

## Exercise 2: Sessions

<details><summary>Hint 1</summary>

Two commands must happen together: one writes the hash, one sets the expiry. Which Redis feature makes several commands run as a unit?
</details>

<details><summary>Hint 2</summary>

`redis.multi().hset(k, {...}).expire(k, ttl).exec()`. Hash values must be strings, so `String(now)`. `exec()` resolves to `[[err, reply], ...]`, so check the errors. For `getSession`, `hgetall` returns `{}` for a missing key.
</details>

<details><summary>Hint 3</summary>

`touchSession`: `EXPIRE` replies 1 if the key exists and 0 if it doesn't, and it never creates keys, which is exactly the contract. `destroySession`: `DEL` replies with how many keys it removed.
</details>

## Exercise 3: Leaderboard

<details><summary>Hint 1</summary>

The commands are `ZINCRBY`, `ZREVRANGE` and `ZREVRANK`. "REV" because the highest score should come first.
</details>

<details><summary>Hint 2</summary>

`ZINCRBY` replies with a string. `ZREVRANGE key 0 n-1 WITHSCORES` replies with a flat array `[member, score, member, score, ...]`. Stop indexes are inclusive.
</details>

<details><summary>Hint 3</summary>

Loop `i` over the flat array in steps of 2: `player = flat[i]`, `score = Number(flat[i + 1])`, `rank = i / 2 + 1`. `ZREVRANK` is 0-based and returns `null` for a missing member.
</details>

## Exercise 4: Unique visitors

<details><summary>Hint 1</summary>

The HyperLogLog commands all start with `PF` (after Philippe Flajolet, who invented the algorithm).
</details>

<details><summary>Hint 2</summary>

`PFADD key element` replies 1 if the estimate changed. `PFCOUNT` accepts **several keys** and returns the estimated size of their union.
</details>

<details><summary>Hint 3</summary>

`countUniqueAcross`: `redis.pfcount(...days.map(visitorsKey))`, after returning 0 for an empty list. Don't use `PFMERGE` into one of the day keys: that modifies the day's count.
</details>

## Exercise 5: Activity feed

<details><summary>Hint 1</summary>

Newest first means pushing at the head. Something then has to throw away the tail.
</details>

<details><summary>Hint 2</summary>

`LPUSH` + `LTRIM` inside `multi()`. Store `JSON.stringify(activity)` and `JSON.parse` on the way out.
</details>

<details><summary>Hint 3</summary>

`LTRIM key 0 maxLength-1` keeps exactly `maxLength` items. `LRANGE key 0 limit-1` reads the newest `limit`. Both stop indexes are inclusive.
</details>

## Exercise 6: Lock

<details><summary>Hint 1</summary>

Acquire must be one command that sets a value only if the key doesn't exist **and** sets an expiry. `SET` has options for both.
</details>

<details><summary>Hint 2</summary>

`redis.set(k, token, "PX", ttlMs, "NX")` replies `"OK"` when set and `null` when the key already exists. For release, `redis.eval(script, numberOfKeys, ...keys, ...args)` runs Lua atomically. Inside the script, `redis.call("GET", KEYS[1])` reads, and `ARGV[1]` is the first non-key argument.
</details>

<details><summary>Hint 3</summary>

Release script: if `GET KEYS[1]` equals `ARGV[1]` then return `DEL KEYS[1]`, else return 0. `withLock`: acquire → if `null` throw `LockNotAcquiredError` → `try { return await fn(); } finally { await releaseLock(...) }`. The `await` inside `try` matters.
</details>

## Exercise 7: Coupons

<details><summary>Hint 1</summary>

Part A: one command both checks membership and adds. Look at what its reply means.
</details>

<details><summary>Hint 2</summary>

Part B needs a read (is the user in? how many claimed?) followed by a conditional write. From Node that's a race: try it and watch the concurrency test fail. Move the logic into a Lua script with `SISMEMBER`, `SCARD` and `SADD`.
</details>

<details><summary>Hint 3</summary>

Pass the limit in `ARGV` as a string and use `tonumber(ARGV[2])` in Lua. Return the result strings (`"claimed"`, ...) straight from the script. In TypeScript, `eval` returns `unknown`, so check the reply is one of the three values before returning it.
</details>

## Exercise 8: Event stream

<details><summary>Hint 1</summary>

`XADD` appends. `XRANGE` reads a range by id. Both have options you'll need.
</details>

<details><summary>Hint 2</summary>

`redis.xadd(k, "MAXLEN", "~", String(maxLen), "*", ...Object.entries(fields).flat())`. `XRANGE` start `-` means "from the beginning", and a start of `(<id>` is **exclusive**. Add `"COUNT", count`.
</details>

<details><summary>Hint 3</summary>

`xrange` returns `[id, [k1, v1, k2, v2]][]`. Map each entry to `{ id, fields }`, building `fields` by walking the flat array two at a time. Use `-` when `afterId` is `"0"`, otherwise `(${afterId}`.
</details>
