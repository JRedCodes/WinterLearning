# Pagination deep dive

Pagination looks like a detail until a table hits ten million rows or a mobile app shows the same item twice. This page goes further than the lesson: the SQL, the edge cases, and how to choose.

## Offset: what really happens

```sql
SELECT * FROM tasks WHERE project_id = $1 ORDER BY created_at LIMIT 20 OFFSET 100000;
```

Postgres has to produce the first 100,020 rows in order and throw away 100,000 of them. With an index on `(project_id, created_at)` it walks the index, but it still visits every skipped entry. Response time grows linearly with page depth. Crawlers and "export everything" scripts that page to the end will hurt.

And the **shifting window**:

```
page 1 (offset 0, limit 3):  [A B C]          D E F G
new item Z inserted first:   Z A B C D E F G
page 2 (offset 3, limit 3):        [C D E]    ← C shown twice
```

Deletes do the opposite: an item slides back into the previous page and is never shown.

## Keyset: the SQL

Ascending by `(created_at, id)`:

```sql
SELECT * FROM tasks
 WHERE project_id = $1
   AND (created_at, id) > ($2, $3)         -- row-value comparison
 ORDER BY created_at, id
 LIMIT $4 + 1;
```

Descending (`sort=-createdAt`): flip both the comparison and the order:

```sql
   AND (created_at, id) < ($2, $3)
 ORDER BY created_at DESC, id DESC
```

Index: `CREATE INDEX ON tasks (project_id, created_at, id);`. Postgres can use it for both directions.

Row-value comparison `(a, b) > (x, y)` means `a > x OR (a = x AND b > y)`. It's exactly "after this position in the ordering", and Postgres can satisfy it with a single index range scan.

### Sorting by a non-unique, mutable field

Sorting by `priority` or `dueDate` works the same way, as long as you:

1. always append a unique tiebreaker (`id`) to the ORDER BY and the cursor,
2. accept that if a row's sort key **changes** while someone is paging, that row may appear twice or not at all. Sort by immutable fields (`created_at`) for anything that must be exact, like sync and export.

Nullable sort keys need care too: decide `NULLS FIRST/LAST` and encode "null" explicitly in the cursor.

## What goes in a cursor

```jsonc
// decoded cursor
{ "createdAt": "2026-01-01T00:00:07.000Z", "id": "1c9e…", "sort": "createdAt" }
```

- The keyset position (all ORDER BY columns).
- The sort, so a cursor can't be replayed against a different ordering.
- Optionally a hash of the filters, for the same reason (`status=done` cursor reused without the filter).
- Optionally a format version (`"v": 1`), so you can change the layout later.

Encode as base64url so it's URL-safe. Sign it with an HMAC if you need it to be tamper-evident, for example if you'd otherwise have to validate every field carefully, or the cursor encodes something a client shouldn't change.

## `limit + 1`

Fetching one extra row answers "is there a next page?" for free. Don't return the extra row. Build `nextCursor` from the **last returned** item, not the extra one.

## Total counts

Clients love "Showing 1–20 of 12,345". `SELECT count(*)` on a big filtered table is a full scan in Postgres. Options:

- don't offer it (most feeds don't),
- offer an estimate (`EXPLAIN` row estimate, or `pg_class.reltuples` for whole tables),
- cap it: "1,000+" (count with `LIMIT 1001` in a subquery),
- compute it asynchronously or cache it.

## Previous page and bidirectional cursors

To support "previous", also return a `prevCursor` built from the **first** item, and query in the reverse direction, then reverse the results in memory. Many APIs skip this: infinite scroll only goes forward.

## Choosing

| Need | Use |
|---|---|
| Infinite scroll, feeds, mobile lists | cursor |
| Sync / export / "give me everything since X" | cursor on an immutable key (`id` or `created_at`) |
| Admin table with page numbers, small data | offset (with a max offset) |
| Search results ranked by score | offset with a low cap (users don't go past page 10), or the search engine's own `search_after` |

## Link headers (alternative to body metadata)

Some APIs (GitHub) put pagination in a header instead of the body:

```http
Link: <https://api.example.com/v1/tasks?cursor=eyJ…>; rel="next"
```

It works with bare-array bodies, but it's less discoverable. Envelope metadata, as in the challenge, is more common in modern JSON APIs.
