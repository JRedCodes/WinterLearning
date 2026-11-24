# Reading EXPLAIN plans, step by step

Every plan below comes from this module's seeded database (20k users, 120k posts, 240k comments). Run `make seed`, then `make psql`, and follow along. Your numbers will differ slightly.

## A method that works on any plan

1. **Find the expensive node.** In `EXPLAIN ANALYZE`, look for the node where `actual time` jumps, or where `rows × loops` is huge.
2. **Compare estimated vs actual rows** on that node. Off by 10× or more means the planner was misinformed.
3. **Look for wasted work:** `Rows Removed by Filter`, `Heap Fetches`, a `Sort` on many rows, a `Nested Loop` with large `loops`.
4. **Ask "what access path would avoid this?"** Usually an index, a rewrite to a sargable predicate, or fetching less.
5. **Change one thing and re-run.** Plans are empirical; don't trust intuition alone.

## Example 1: filter on an unindexed column

```sql
EXPLAIN ANALYZE SELECT id FROM posts WHERE author_id = 1234 ORDER BY created_at DESC LIMIT 20;
```

```
Limit (actual time=9.8..9.8 rows=6 loops=1)
  -> Sort (actual time=9.8..9.8 rows=6 loops=1)
       Sort Key: created_at DESC
       -> Seq Scan on posts (cost=0.00..8233.00 rows=6 width=16) (actual time=0.4..9.7 rows=6 loops=1)
            Filter: (author_id = 1234)
            Rows Removed by Filter: 119994
```

- The estimate (6 rows) is accurate. The planner knows few rows match; it simply has no index to find them.
- `Rows Removed by Filter: 119994`: it read the whole table.
- Fix: `CREATE INDEX ON posts (author_id, created_at DESC, id DESC)`. Afterward:

```
Limit (actual rows=6 loops=1)
  -> Sort (actual rows=6 loops=1)
       Sort Key: created_at DESC, id DESC
       -> Bitmap Heap Scan on posts (actual rows=6 loops=1)
            Recheck Cond: (author_id = 1234)
            -> Bitmap Index Scan on posts_author_id_created_at_id_idx
                 Index Cond: (author_id = 1234)
```

  Surprised by the Sort? Each seed author has only ~6 posts, so the planner decides that fetching 6 rows via a bitmap and sorting them in memory is cheapest. That's a correct choice, not a failure of the index. For an author with 50,000 posts, the same index lets the planner use a plain `Index Scan` that returns rows already in order and stops after the `LIMIT`, with no Sort node. The plan depends on the data, which is why you always check plans on realistic volumes.

## Example 2: function on the column

```sql
EXPLAIN SELECT id FROM users WHERE lower(email) = 'user77@example.com';
```

```
Seq Scan on users (cost=0.00..725.00 rows=100 width=8)
  Filter: (lower(email) = 'user77@example.com'::text)
```

Notice `rows=100`. The planner has no statistics for `lower(email)`, so it falls back to a default guess (0.5% of rows). After `CREATE INDEX ON users (lower(email))` and `ANALYZE`, Postgres collects statistics on the expression too, and the estimate becomes 1. Expression indexes improve estimates as well as access.

## Example 3: deep OFFSET

```sql
EXPLAIN ANALYZE SELECT id FROM posts ORDER BY created_at DESC, id DESC LIMIT 100 OFFSET 3000;
```

```
Limit (actual time=0.9..0.9 rows=100 loops=1)
  -> Index Only Scan Backward using posts_created_at_id_idx on posts (actual time=0.03..0.8 rows=3100 loops=1)
```

The index *is* used, and it's even an Index Only Scan, yet it produced **3,100 rows to return 100**. "Uses an index" is not the same as "efficient". At `OFFSET 100000` that's 100,100 rows per request. The keyset version:

```sql
EXPLAIN ANALYZE SELECT id FROM posts
WHERE (created_at, id) < ('2026-05-29 23:20:00+00', 3001)
ORDER BY created_at DESC, id DESC LIMIT 100;
```

```
Limit (actual rows=100 loops=1)
  -> Index Only Scan Backward using posts_created_at_id_idx on posts (actual rows=100 loops=1)
       Index Cond: (ROW(created_at, id) < ROW('2026-05-29 23:20:00+00'::timestamptz, 3001))
```

`Index Cond` (not `Filter`) means the condition is used to *seek* into the index.

## Example 4: Index Cond vs Filter

Both appear under scan nodes, and the difference is crucial:

- **Index Cond**: used to navigate the index. Only matching entries are visited.
- **Filter**: applied to rows *after* they're fetched. Rows that fail are wasted work (`Rows Removed by Filter`).

With an index on `(author_id, created_at)`:

```sql
WHERE author_id = 5 AND created_at > now() - interval '7 days'   -- both in Index Cond
WHERE author_id = 5 AND body LIKE '%cat%'                         -- author_id: Index Cond, body: Filter
```

A Filter on a handful of rows is fine. A Filter discarding thousands of rows per execution is a signal to adjust the index or the query.

## Example 5: nested loop with many loops

```
Nested Loop (actual rows=20 loops=1)
  -> Index Scan Backward using posts_created_at_id_idx on posts p (actual rows=20 loops=1)
  -> Index Scan using users_pkey on users u (actual rows=1 loops=20)
       Index Cond: (id = p.author_id)
```

`loops=20` on the inner node means it ran 20 times, once per post. Here that's ideal: 20 index lookups. If the outer side were 50,000 rows, 50,000 index lookups would be slower than one Hash Join, and you'd expect the planner to switch. If it doesn't, check the row estimates on the outer side.

This is also the database-side picture of an N+1: the same 20 lookups, but done inside one query, with no network round trips.

## Example 6: BUFFERS

```sql
EXPLAIN (ANALYZE, BUFFERS) SELECT * FROM posts ORDER BY created_at DESC LIMIT 20;
```

```
Limit (actual rows=20 loops=1)
  Buffers: shared hit=24
  -> Index Scan Backward using posts_created_at_id_idx on posts ...
```

`shared hit` = pages found in Postgres's cache; `read` = pages fetched from the OS/disk. Comparing buffers between two versions of a query is often more stable than comparing milliseconds, which vary with cache state and machine load.

## Plan node glossary

| Node | One-liner |
|---|---|
| Seq Scan | read the whole table |
| Index Scan | walk index, fetch rows (in index order) |
| Index Only Scan | answer from the index alone |
| Bitmap Index Scan / Bitmap Heap Scan | gather matching locations, then read pages in physical order |
| Sort | sort rows (watch `Sort Method: external merge` = spilled to disk) |
| Incremental Sort | input partly sorted already; sort within groups |
| Limit | stop after N rows (can short-circuit the tree below) |
| Hash / Hash Join | build hash table, probe it |
| Merge Join | merge two sorted inputs |
| Nested Loop | for each outer row, run the inner side |
| HashAggregate / GroupAggregate | GROUP BY via hash table / sorted input |
| Gather | collect rows from parallel workers |
| Memoize | cache inner-side results of a nested loop by key |

## FORMAT JSON in code

The challenge's tests run `EXPLAIN (FORMAT JSON)` on the exact SQL your repositories executed and walk the tree:

```ts
const { rows } = await pool.query(`EXPLAIN (FORMAT JSON) ${q.text}`, q.values);
const plan = rows[0]["QUERY PLAN"][0].Plan; // { "Node Type", "Relation Name", Plans: [...] }
```

You can use the same trick in your own projects: a test that fails if a hot query starts doing a Seq Scan on a big table is a cheap guard against regressions.
