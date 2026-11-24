# Pagination and N+1, in depth

## Part 1: Keyset pagination done right

### The contract

A good cursor API looks like this:

```
GET /feed?limit=20
→ { "data": [...20 items...], "nextCursor": "eyJ0IjoiMjAyNi0wNS0yOSAyMzoyMDowMCswMCIsImlkIjoiMzAwMSJ9" }

GET /feed?limit=20&cursor=eyJ0Ijoi...
→ { "data": [...], "nextCursor": "..." | null }
```

- `nextCursor: null` means there are no more items.
- The cursor is **opaque**: clients store it and send it back, nothing else. Document it that way, so you can change the encoding later.
- Invalid or tampered cursors get a clear 400 (`INVALID_CURSOR`), not a 500.
- `limit` is bounded (e.g. 1–100); a client asking for 1,000,000 shouldn't take down the database.

### The query, for any sort order

The general shape for `ORDER BY a DESC, b DESC` where `(a, b)` is unique:

```sql
SELECT ... FROM t
WHERE (a, b) < ($last_a, $last_b)
ORDER BY a DESC, b DESC
LIMIT $limit_plus_one;
```

For ascending order, flip to `>`. The **row value comparison** `(a, b) < (x, y)` means `a < x OR (a = x AND b < y)`, and Postgres can use it as an index condition on a matching B-tree index. Writing the expanded `OR` form works too, but planners handle it less reliably.

Mixed directions (`ORDER BY score DESC, id ASC`) can't use a single row comparison. Options: an expanded `OR` condition plus an index with matching mixed directions `(score DESC, id ASC)`, or negating a numeric column.

### What goes in the cursor

Exactly the sort key of the last row returned, and nothing that depends on the page number.

```ts
const last = page[page.length - 1];
const nextCursor = hasMore ? encode({ t: last.createdAtText, id: last.id }) : null;
```

**Precision trap.** `timestamptz` has microseconds; a JS `Date` has milliseconds. Say two rows have `created_at` values `...00.123456` and `...00.123999`. Your cursor stores `...00.123Z`, and `(created_at, id) < ('...00.123', id)` now excludes both: they're skipped forever. Carry the database's own representation (`created_at::text`), or epoch microseconds as a string.

**Filter changes.** If the client changes filters (e.g. a search term) mid-pagination, an old cursor may point to a position that doesn't make sense. Many APIs embed a hash of the filter in the cursor and reject mismatches.

### "Has more?" without counting

Fetch `limit + 1` rows. If you got `limit + 1`, there's a next page; return the first `limit`. `SELECT count(*)` over a big table on every request is expensive, and it's usually not needed for infinite scroll.

### Previous page

Run the comparison the other way (`>` with `ORDER BY ... ASC`), then reverse the results in code. Or just let clients keep the cursors they've already seen.

### When OFFSET is fine

- Small, bounded result sets (an admin's 200 filtered records).
- UIs that genuinely need "page 7 of 12".
- Data that doesn't change while users page through it.

## Part 2: N+1 in depth

### Spotting it

- Query logs showing the same statement repeated with different parameters.
- In tests: count queries per request and assert an upper bound (this challenge's tests do).
- In production: `pg_stat_statements` with a huge `calls` count and tiny `mean_exec_time`; APM traces showing a "comb" of identical short spans.

### Fix options compared

| Fix | Queries | Pros | Cons |
|---|---|---|---|
| JOIN | 1 | single round trip | repeated parent columns for one-to-many; one repository reaches into another's table |
| `= ANY($1)` batch per relation | 1 + relations | each repository owns its table; easy to cache per entity | stitching code in the service |
| Subquery / LATERAL in the main query | 1 | aggregates (counts) without a separate query | more complex SQL |
| DataLoader | 1 per relation per tick | automatic batching in GraphQL resolvers | per-request instance needed (cache must not leak across users) |
| Denormalize (e.g. `posts.comment_count`) | 0 extra | fastest reads | must be maintained on every write; can drift |

For counts specifically, a LATERAL join is a neat single-query option:

```sql
SELECT p.id, c.n AS comment_count
FROM posts p
CROSS JOIN LATERAL (SELECT count(*)::int AS n FROM comments WHERE post_id = p.id) c
ORDER BY p.created_at DESC, p.id DESC
LIMIT 20;
```

The LIMIT applies before the lateral subquery runs for each of the 20 rows, so it does 20 index lookups inside one query.

### Batched queries: the details

```ts
async findByIds(ids: readonly string[]): Promise<User[]> {
  if (ids.length === 0) return [];                     // ANY('{}') works, but skip the round trip
  const { rows } = await this.db.query(
    "SELECT ... FROM users WHERE id = ANY($1::bigint[])",
    [[...new Set(ids)]],                               // dedupe: 20 posts may share 3 authors
  );
  return rows.map(toUser);                             // order NOT guaranteed: stitch by id
}
```

- `= ANY($1)` with one array parameter beats building `IN ($1, $2, ..., $20)`: one statement shape regardless of size, so `pg_stat_statements` groups it and the SQL never changes.
- Results come back in arbitrary order. Build a `Map` and look up by id.
- For `GROUP BY` counts, absent keys mean zero.
- Batches of thousands of ids are fine; tens of thousands, consider chunking or a JOIN against the original query.

### The pool angle

An N+1 doesn't only add latency. Each of those queries checks out a pool connection. With `Promise.all` the 40 lookups try to grab 40 connections at once; with a pool of 10, 30 wait, and so do all *other* requests. A single slow endpoint with an N+1 can starve the whole service. Fewer, set-based queries are the fix.
