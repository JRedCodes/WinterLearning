# Indexing & query tuning cheat sheet

## Creating indexes

```sql
CREATE INDEX posts_author_id_idx ON posts (author_id);                       -- single column
CREATE INDEX posts_author_feed_idx ON posts (author_id, created_at DESC, id DESC); -- composite
CREATE INDEX ON posts (author_id) INCLUDE (created_at);                      -- covering
CREATE UNIQUE INDEX users_lower_email_key ON users (lower(email));          -- expression + unique
CREATE INDEX jobs_pending_idx ON jobs (run_at) WHERE status = 'pending';    -- partial
CREATE INDEX CONCURRENTLY ...;           -- live tables: no write lock (not inside a transaction)
DROP INDEX CONCURRENTLY posts_author_id_idx;
REINDEX INDEX CONCURRENTLY posts_author_id_idx;  -- rebuild a bloated index
```

Naming convention: `<table>_<columns>_idx`, `<table>_<columns>_key` for unique.

## Which index for which query

| Query shape | Index |
|---|---|
| `WHERE a = ?` | `(a)` |
| `WHERE a = ? AND b = ?` | `(a, b)` or `(b, a)`; most selective first |
| `WHERE a = ? ORDER BY b DESC LIMIT n` | `(a, b DESC)` |
| `WHERE a = ? AND b > ?` | `(a, b)`: equality first, range last |
| `WHERE lower(x) = ?` | `(lower(x))` |
| `WHERE x::date = ?` | rewrite as a range on `x`, index `(x)` |
| `WHERE status = 'rare' ...` | partial: `... WHERE status = 'rare'` |
| `WHERE col ILIKE '%term%'` | `pg_trgm`: `CREATE INDEX ON t USING gin (col gin_trgm_ops)` |
| `WHERE tags @> ARRAY['x']` / jsonb `@>` | GIN |
| full-text search | GIN on `to_tsvector(...)` |
| `WHERE (a, b) < (?, ?) ORDER BY a DESC, b DESC` | `(a, b)` (keyset pagination) |
| FK column used in joins / cascades | `(fk_column)` (not automatic!) |
| time-series, huge append-only table, range scans | BRIN on the timestamp |

## Index types at a glance

| Type | Good for |
|---|---|
| B-tree (default) | equality, ranges, sorting, prefix `LIKE 'abc%'` (with `text_pattern_ops` or C collation) |
| Hash | equality only (rarely better than B-tree) |
| GIN | "contains" queries: arrays, jsonb, full-text, trigrams |
| GiST | geometric, ranges, exclusion constraints, nearest-neighbour |
| BRIN | very large tables where values correlate with physical order |

## Non-sargable patterns and their rewrites

| ❌ Can't use index on `col` | ✅ Rewrite |
|---|---|
| `WHERE lower(email) = $1` | expression index, or store normalized email / `citext` |
| `WHERE created_at::date = '2026-05-01'` | `created_at >= '2026-05-01' AND created_at < '2026-05-02'` |
| `WHERE extract(year FROM created_at) = 2026` | range on `created_at` |
| `WHERE id::text = $1` | `WHERE id = $1::bigint` |
| `WHERE price * 1.2 > 100` | `WHERE price > 100 / 1.2` |
| `WHERE coalesce(deleted_at, 'infinity') > now()` | `WHERE deleted_at IS NULL OR deleted_at > now()` |
| `WHERE name LIKE '%son'` | trigram GIN index or reverse-string expression index |

## EXPLAIN quick reference

```sql
EXPLAIN SELECT ...;                         -- plan only, nothing runs
EXPLAIN ANALYZE SELECT ...;                 -- runs it; actual rows & times
EXPLAIN (ANALYZE, BUFFERS) SELECT ...;      -- + cache hits / disk reads
EXPLAIN (ANALYZE, FORMAT JSON) SELECT ...;  -- machine-readable
BEGIN; EXPLAIN ANALYZE DELETE ...; ROLLBACK; -- safe for writes
```

Red flags: `Seq Scan` on a big table for a selective query · `Rows Removed by Filter` ≫ rows returned · estimate vs actual off by 10× · `Sort Method: external merge` · `Nested Loop` with huge `loops` · deep `OFFSET`.

## Statistics and maintenance

```sql
ANALYZE posts;                                  -- refresh planner statistics
SELECT relname, n_live_tup, last_analyze, last_autoanalyze FROM pg_stat_user_tables;
CREATE STATISTICS posts_stats (dependencies) ON author_id, created_at FROM posts; -- correlated columns
```

## Finding problems

```sql
-- Top queries by total time (needs pg_stat_statements)
SELECT calls, round(total_exec_time) total_ms, round(mean_exec_time, 2) mean_ms, rows, left(query, 80)
FROM pg_stat_statements ORDER BY total_exec_time DESC LIMIT 15;

-- Unused indexes (candidates to drop; check replicas too!)
SELECT relname, indexrelname, idx_scan, pg_size_pretty(pg_relation_size(indexrelid)) AS size
FROM pg_stat_user_indexes WHERE idx_scan = 0 ORDER BY pg_relation_size(indexrelid) DESC;

-- Tables read mostly by Seq Scan
SELECT relname, seq_scan, seq_tup_read, idx_scan FROM pg_stat_user_tables ORDER BY seq_tup_read DESC;

-- Index and table sizes
SELECT pg_size_pretty(pg_relation_size('posts')), pg_size_pretty(pg_indexes_size('posts'));

-- What's running right now
SELECT pid, now() - query_start AS running, state, left(query, 80) FROM pg_stat_activity WHERE state <> 'idle';
```

Settings worth knowing: `log_min_duration_statement` (log slow queries), `auto_explain.log_min_duration` (log their plans), `statement_timeout`, `work_mem` (memory per sort/hash before spilling to disk).
