# Back-of-envelope estimates: cheat sheet

Estimates exist to pick an architecture, not to be correct. Round hard, show your arithmetic, and always end with **"so what?"**.

## Time

| | Seconds | Round to |
|---|---|---|
| 1 minute | 60 | |
| 1 hour | 3,600 | |
| 1 day | 86,400 | **~10^5** |
| 1 month | ~2.6 M | ~2.5 × 10^6 |
| 1 year | ~31.5 M | ~3 × 10^7 |

**Per day → per second:** divide by 100,000.

| Per day | ≈ per second (avg) |
|---|---|
| 1 M | ~12 |
| 10 M | ~120 |
| 100 M | ~1,200 |
| 1 B | ~12,000 |
| 10 B | ~120,000 |

## Sizes

| | Bytes |
|---|---|
| ASCII char | 1 |
| int / bigint / timestamp | 4 / 8 / 8 |
| UUID | 16 (36 as text) |
| A short text row (tweet, link, chat message) | ~100 B – 1 KB with overhead |
| JSON API response, small | 1–10 KB |
| Thumbnail image | 10–50 KB |
| Phone photo | 2–5 MB |
| 1 minute of 1080p video | ~50–100 MB |

Powers of two you'll use: 2^10 ≈ 1 thousand (KB), 2^20 ≈ 1 million (MB), 2^30 ≈ 1 billion (GB), 2^40 ≈ 1 trillion (TB). 62^6 ≈ 57 billion, 62^7 ≈ 3.5 trillion.

## Latency (approximate, for ratios)

| | |
|---|---|
| Main memory reference | ~100 ns |
| Read 1 MB from memory | ~10 µs |
| SSD random read | ~20–100 µs |
| Read 1 MB from NVMe SSD | ~0.3 ms |
| Same-datacenter round trip | ~0.5 ms |
| Redis GET (network) | ~0.2–1 ms |
| Indexed Postgres query (network) | ~1–5 ms |
| HDD seek | ~5–10 ms |
| Cross-US round trip | ~60–70 ms |
| Transatlantic round trip | ~80–150 ms |
| TLS handshake on a new connection | +1 round trip (TLS 1.3) |

## Throughput rules of thumb (one instance, order of magnitude only)

| | |
|---|---|
| Node.js API process (JSON + a DB call) | 1k–10k req/s |
| Postgres simple indexed reads | 10k–50k+ /s |
| Postgres small write transactions | 1k–10k+ /s |
| Redis | 100k+ ops/s per node |
| Kafka partition | ~10 MB/s+ |
| 1 Gbps NIC | ~100 MB/s |
| WebSocket gateway | 50k–500k+ idle connections |

## Formulas

```
avg QPS          = DAU × actions per user per day ÷ 86,400
peak QPS         = avg × peak factor        (2–3x daily curve, 10x+ for events)
storage          = item size × items per day × retention days × replication factor
bandwidth        = QPS × payload size
cache memory     = hot items × item size    (hot set often 10–20% of daily active items)
servers needed   = peak QPS ÷ per-server capacity, then × 1.5–2 for headroom and N+1
connections      = concurrent users × connections per user
Little's law     L = λ × W                  (in-flight requests = arrival rate × latency)
```

Little's law example: 2,000 req/s with 200 ms average latency → 2,000 × 0.2 = **400 requests in flight**. If each holds a database connection for the whole request, you'd need ~400 connections, so either shorten the time a connection is held or put a pool/queue in front.

## Availability

| | Downtime/year | Downtime/month |
|---|---|---|
| 99% | 3.65 days | 7.3 h |
| 99.9% | 8.8 h | 44 min |
| 99.95% | 4.4 h | 22 min |
| 99.99% | 53 min | 4.4 min |
| 99.999% | 5.3 min | 26 s |

**Serial dependencies multiply:** a request needing three services at 99.9% each is at most 99.9%³ ≈ **99.7%**.
**Redundant copies help:** two independent replicas at 99% each → 1 − 0.01² = **99.99%** (if failures are truly independent, which they often aren't).

## Template

Fill this in for every design:

```
Users:       ___ DAU, ___ actions/user/day
Writes:      ___ /day → ___ /s avg → ___ /s peak (factor ___ because ___)
Reads:       ___ /day → ___ /s avg → ___ /s peak      read:write = ___ : 1
Item size:   ___ B   → storage ___ /day → ___ /year → ___ over ___ years (× ___ replicas)
Bandwidth:   ___ /s × ___ KB = ___ MB/s at peak
Hot set:     ___ items × ___ B = ___ GB of cache
So what:     1. ___   2. ___   3. ___
```

## Sanity checks

- Does your QPS make sense per user? 100M DAU and 1M QPS means each user makes ~860 requests a day. Plausible for a feed with polling, absurd for a banking app.
- Is your storage per row realistic once you add indexes (often 2–3x the raw data)?
- Did you account for replicas and backups when quoting storage cost?
- Did you check the **peak**, not just the average? Systems fall over at peak.
