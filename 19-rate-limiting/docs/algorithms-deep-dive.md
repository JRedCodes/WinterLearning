# Rate limiting algorithms: a deeper look

The lesson covers what each algorithm does. This page walks through **traces**: exact sequences of requests and what each algorithm decides. If you can produce these traces on a whiteboard, you understand the algorithm.

All traces use **limit 5 per 1000 ms** (or, for the token bucket, **capacity 5, refill 5/s**).

## Trace 1: a steady client

Requests at t = 0, 200, 400, 600, 800, 1000, 1200 (5 per second, exactly the limit).

| t (ms) | Fixed window | Sliding log | Token bucket |
|---|---|---|---|
| 0 | ✅ (1/5) | ✅ (1 in log) | ✅ tokens 5 → 4 |
| 200 | ✅ (2/5) | ✅ (2) | ✅ 4 + 1 − 1 = 4 |
| 400 | ✅ (3/5) | ✅ (3) | ✅ 4 |
| 600 | ✅ (4/5) | ✅ (4) | ✅ 4 |
| 800 | ✅ (5/5) | ✅ (5) | ✅ 4 |
| 1000 | ✅ new window (1/5) | ✅ t=0 slid out (5) | ✅ 4 |
| 1200 | ✅ (2/5) | ✅ t=200 slid out (5) | ✅ 4 |

All three agree for well-behaved traffic. The differences only show up at the edges, and the edges are where attackers and buggy clients live.

## Trace 2: the boundary burst

5 requests at t = 990, then 5 at t = 1010.

| t (ms) | Fixed window | Sliding log | Token bucket |
|---|---|---|---|
| 990 ×5 | ✅✅✅✅✅ (window 0 full) | ✅✅✅✅✅ | ✅✅✅✅✅ (5 → 0) |
| 1010 ×5 | ✅✅✅✅✅ (window 1 is new!) | ❌❌❌❌❌ (all 5 still within 1000ms) | ❌❌❌❌❌ (20 ms × 5/s refilled only 0.1 tokens) |

Fixed window allowed **10 requests in 20 ms**. The sliding log allowed 5. The token bucket allowed 5 (and will allow one more every 200ms).

Retry-After for the sliding log at t = 1010: oldest entry (990) + 1000 − 1010 = **980 ms**. For the token bucket: one token takes 200ms; 0.1 tokens have accumulated, so (1 − 0.1) / 0.005 per ms = **180 ms**.

## Trace 3: idle, then burst

Nothing for 10 seconds, then 8 requests at once.

- **Fixed window:** 5 ✅, 3 ❌. Retry when the window ends (anywhere from 1 to 1000 ms, depending on where in the window you are).
- **Sliding log:** 5 ✅, 3 ❌. Retry after 1000 ms (when the burst slides out).
- **Token bucket:** 5 ✅ (bucket was capped at capacity, not 50), 3 ❌. Retry after 200 ms.

The token bucket recovers fastest because it refills continuously; the sliding log makes the client wait for the entire burst to age out.

## The sliding window counter, worked

Fixed windows of 1000 ms. Previous window (0–999) had **4** requests. Current window (1000–1999) has **2** so far. Now t = 1250, which is 25% into the current window.

```
weight of previous window = 1 − 250/1000 = 0.75
estimate = 2 + 4 × 0.75 = 5.0
```

5.0 is not < 5, so the request is rejected. At t = 1500: `2 + 4 × 0.5 = 4` → allowed.

The estimate is exact if the previous window's requests were evenly spread, an overestimate if they were bunched at the start, and an underestimate if bunched at the end. For high-volume traffic, the error is small. It needs two counters per key (`current`, `previous`), both of which expire after two windows.

As a Lua sketch:

```lua
local cur  = tonumber(redis.call('GET', KEYS[1]) or '0')   -- current window key
local prev = tonumber(redis.call('GET', KEYS[2]) or '0')   -- previous window key
local weight = 1 - (now % window) / window
if cur + prev * weight + cost > limit then return {0, ...} end
redis.call('INCRBY', KEYS[1], cost)
redis.call('PEXPIRE', KEYS[1], window * 2)
```

## Token bucket vs leaky bucket

They're mirror images:

- Token bucket: tokens drip **in**; a request needs a token. Bursts allowed up to capacity.
- Leaky bucket (as a meter): requests pour **in**; the bucket leaks at a fixed rate. Reject if it would overflow. Same decisions as a token bucket with the same parameters.
- Leaky bucket (as a queue): requests wait in line and are released at a fixed rate. This *delays* instead of rejecting. Good when the consumer can only handle exactly N/s (an old SMTP relay, a partner API with a strict rate). Bad for interactive APIs, because users see latency instead of a clear 429.

Another variant you may hear about: **GCRA** (Generic Cell Rate Algorithm). It stores a single timestamp per key, the "theoretical arrival time" of the next allowed request. It behaves like a token bucket but needs one number instead of two, and is used by some popular Redis rate limiting libraries.

## Choosing parameters

- Start from what the *protected thing* can sustain (DB writes/s, partner API quota, cost per call), then divide among callers.
- Allow some burst. Real clients are bursty (a page load fires 6 API calls at once). A token bucket with capacity ≈ "one page load" and rate ≈ "sustained use" usually feels right.
- For security limits (login, password reset, OTP verification), think in attacker terms: 5 attempts per 15 minutes per account makes guessing a 6-digit code take years.
- Measure before tightening. Log what *would* have been rejected ("shadow mode") for a week, then enforce.
