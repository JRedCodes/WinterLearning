# Rate limiting cheat sheet

## Algorithms in one line each

| Algorithm | State per key | Rule |
|---|---|---|
| Fixed window | `count` in key `…:{floor(now/window)}` | allow if `count + cost ≤ limit` |
| Sliding log | sorted set of timestamps | drop `score ≤ now − window`; allow if `ZCARD + cost ≤ limit` |
| Sliding counter | `cur`, `prev` counts | allow if `cur + prev × (1 − elapsed/window) + cost ≤ limit` |
| Token bucket | `{tokens, ts}` | `tokens = min(cap, tokens + Δt × rate)`; allow if `tokens ≥ cost` |
| Leaky bucket | queue / level | level drains at `rate`; reject (or queue) when full |

## Retry-After formulas

| Algorithm | Retry after (ms) |
|---|---|
| Fixed window | `(window + 1) × windowMs − now` |
| Sliding log | `score of the (count + cost − limit)-th oldest entry + windowMs − now` |
| Token bucket | `ceil((cost − tokens) / ratePerMs)` |

Headers want **seconds, rounded up, minimum 1**.

## Redis commands you'll use

```
INCRBY key n                    # atomic add, returns new value
PEXPIRE key ms                  # TTL in milliseconds
PTTL key                        # remaining TTL (-1 = none, -2 = no key)
ZADD key score member           # add to sorted set
ZREMRANGEBYSCORE key -inf max   # drop old entries (inclusive)
ZCARD key                       # count
ZRANGE key i i WITHSCORES       # i-th oldest entry and its score
HMGET key f1 f2 / HSET key f v  # hash fields
EVAL / EVALSHA src|sha numkeys k… a…
SCAN 0 MATCH prefix* COUNT 500  # never KEYS in production
```

## Lua reminders

```lua
local n = tonumber(ARGV[1])                       -- ARGV are strings
local v = tonumber(redis.call('GET', KEYS[1]) or '0')  -- nil GET → false
redis.call('HSET', KEYS[1], 'tokens', tostring(x))      -- keep fractions
return {math.floor(a), math.ceil(b)}              -- floats get truncated
```

## HTTP

```http
HTTP/1.1 429 Too Many Requests
Retry-After: 3
RateLimit-Limit: 100
RateLimit-Remaining: 0
RateLimit-Reset: 27
```

- 429 = you, slow down. 503 = we are broken. 403 = never allowed.
- Send `RateLimit-*` on successful responses too.

## Keys

| Key | Use for | Watch out |
|---|---|---|
| `ip:<ip>` | anonymous traffic | NAT (shared IPs), proxies (`trust proxy`), botnets |
| `key:<hash(apiKey)>` | API customers | hash secrets |
| `user:<id>` | logged-in features | needs auth first |
| `ip:<ip>:user:<hash(name)>` | login | combine with a per-account limit for distributed attacks |

## Policy checklist

- [ ] Which layer: edge / gateway / app?
- [ ] Key per route?
- [ ] Algorithm and parameters (burst vs sustained)?
- [ ] Fail open or closed per route? Fail fast (offline queue off, timeout)?
- [ ] Rejections and limiter errors logged and counted?
- [ ] Health checks excluded?
- [ ] Limits documented for API consumers?
