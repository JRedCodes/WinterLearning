# Caching cheat sheet

## Decide whether to cache

Cache it if **all** of these are true:
- [ ] It's measurably slow or expensive (query time, CPU, third-party cost)
- [ ] It's read much more often than it changes
- [ ] The same items are read repeatedly (skewed access)
- [ ] Some staleness is acceptable, and you can say how much

Don't cache: data that must be exact (balances, stock at checkout), data that's cheap to fetch, data that's rarely re-read, highly personalized data with no reuse.

## Pattern picker

| Situation | Pattern |
|---|---|
| Default for read-heavy data | **Cache-aside** + delete-on-write + TTL |
| Want the caching hidden behind an interface | Read-through (a decorator / loader) |
| Written data is read immediately and often | Write-through |
| Write bursts of low-value data (counters, analytics) | Write-behind |
| Data from a periodic source (nightly import, external API) | TTL only |
| Many services hold copies | Event-driven invalidation + TTL |

## Cache-aside skeleton (TypeScript + ioredis)

```ts
const NOT_FOUND = "__not_found__";
const inFlight = new Map<string, Promise<Product | null>>();

async function get(id: string): Promise<Product | null> {
  const key = `app:product:v1:${id}`;
  let raw: string | null = null;
  try { raw = await redis.get(key); } catch { metrics.errors++; }
  if (raw !== null) { metrics.hits++; return raw === NOT_FOUND ? null : JSON.parse(raw); }
  metrics.misses++;

  const running = inFlight.get(id);
  if (running) { metrics.coalesced++; return running; }

  const p = (async () => {
    const product = await db.findProduct(id);
    const value = product ? JSON.stringify(product) : NOT_FOUND;
    const ttl = product ? jitter(300, 0.1) : 30;
    try { await redis.set(key, value, "EX", ttl); } catch { metrics.errors++; }
    return product;
  })().finally(() => inFlight.delete(id));
  inFlight.set(id, p);
  return p;
}

async function update(id: string, patch: Patch) {
  const updated = await db.updateProduct(id, patch);           // DB first
  try { await redis.del(`app:product:v1:${id}`); } catch { metrics.errors++; } // then delete
  return updated;
}
```

## TTL guide

| Data | TTL |
|---|---|
| Static-ish (descriptions, categories) | 5–60 min + invalidate on write |
| Volatile but tolerant (listing price/stock) | 10–60 s |
| Negative ("not found") | 10–60 s |
| L1 in-process copy | 1–10 s |
| Must be exact | don't cache |

Always add **jitter** (±5–20%) when many keys are written together.

## Invalidation guide

| Technique | Use when |
|---|---|
| `DEL` after the DB write | default |
| Schema version in key (`v1` → `v2`) | the cached shape changes |
| Data version counter (`INCR catalog:version`) | invalidate a whole group at once |
| Delayed double delete | you've seen read/write races in practice |
| Pub/sub or events | many processes hold L1 copies |
| TTL | always, as the safety net |

## Stampede defenses

| Defense | Scope | Cost |
|---|---|---|
| Jitter | many keys expiring together | trivial |
| Request coalescing | one key, per process | small |
| Distributed lock + wait/retry | one key, all processes | medium |
| Refresh-ahead / probabilistic early expiry | hot keys, no miss at all | medium |
| Stale-while-revalidate | hot keys, tolerate brief staleness | medium |

## Key checklist

- [ ] App prefix + entity + schema version + id: `shop:product:v1:42`
- [ ] Every input that changes the answer (locale, currency, user/role, query params)
- [ ] Nothing that makes keys unique per request (timestamps, request ids)
- [ ] Normalized (sorted params, consistent casing)
- [ ] Hash long inputs: `search:v1:<sha256(normalized params)>`

## Serialization checklist

- [ ] Cached types are JSON-safe (ISO strings, not `Date`; no `bigint`, `Map`, `Set`, classes)
- [ ] A test asserts `fromCache` deep-equals `fromDb`
- [ ] Shape change → bump the key version

## Metrics

| Metric | Healthy-ish |
|---|---|
| Hit ratio | 80–99% for hot read paths |
| Evictions | ~0 unless intentionally memory-bound |
| Cache errors | ~0, alert on spikes |
| Coalesced misses | non-zero under load = protection working |
| Hit vs miss latency | hit ≪ miss, otherwise why cache? |

## Useful Redis commands while debugging

```text
SCAN 0 MATCH wl:18:product:* COUNT 100
GET wl:18:product:v1:1
TTL wl:18:product:v1:1
INFO stats              # keyspace_hits, keyspace_misses, evicted_keys
INFO memory
MONITOR                 # watch commands live (dev only)
```
