# SQL cheat sheet (Postgres flavour)

A one-page reference for this module. The repo-wide version lives in [../../docs/cheatsheets/sql.md](../../docs/cheatsheets/sql.md).

## Query skeleton (written order → evaluation order)

```sql
WITH cte AS (...)                -- 0. named sub-results
SELECT DISTINCT cols, aggs, win  -- 5. compute output (window functions here), 6. DISTINCT
FROM t JOIN u ON ...             -- 1. build rows
WHERE row_condition              -- 2. filter rows
GROUP BY cols                    -- 3. group
HAVING group_condition           -- 4. filter groups
ORDER BY cols                    -- 7. sort (aliases allowed)
LIMIT n OFFSET m;                -- 8. page
```

## Filtering

| You want | Write |
|---|---|
| equality / inequality | `=`, `<>` (or `!=`) |
| range, inclusive | `price BETWEEN 10 AND 20` |
| time period | `ts >= '2026-03-01' AND ts < '2026-04-01'` |
| one of | `status IN ('paid', 'shipped')` |
| pattern | `name LIKE 'Lap%'`, `ILIKE` = case-insensitive, `_` = one char |
| regex | `email ~* '@example\.(com|org)$'` |
| null | `IS NULL`, `IS NOT NULL`, `IS DISTINCT FROM` |
| has a match elsewhere | `EXISTS (SELECT 1 FROM ... WHERE ...)` |
| has no match | `NOT EXISTS (...)` (avoid `NOT IN` with nullable subqueries) |

## NULL toolbox

```sql
coalesce(city, 'unknown')         -- first non-null
nullif(denominator, 0)            -- turn 0 into NULL (safe division)
count(*) vs count(col)            -- rows vs non-null values
coalesce(sum(x), 0)               -- sum of nothing is NULL
```

## Joins

```sql
a JOIN b ON b.a_id = a.id              -- matching pairs only
a LEFT JOIN b ON b.a_id = a.id         -- all of a; b columns NULL when unmatched
a FULL JOIN b ON ...                   -- all of both
a CROSS JOIN b                         -- every combination
a JOIN b USING (customer_id)           -- shorthand when column names match
```

Anti-join: `LEFT JOIN b ON ... WHERE b.id IS NULL` or `WHERE NOT EXISTS (...)`.

## Aggregates

`count(*)`, `count(DISTINCT x)`, `sum`, `avg`, `min`, `max`, `string_agg(x, ', ' ORDER BY x)`,
`array_agg(x)`, `bool_and`, `bool_or`, `count(*) FILTER (WHERE cond)`.

## Window functions

```sql
fn(...) OVER (PARTITION BY p ORDER BY o [ROWS BETWEEN ... AND ...])
row_number() rank() dense_rank() ntile(n)
lag(x [, offset [, default]]) lead(x) first_value(x) last_value(x)
sum(x) OVER (PARTITION BY p ORDER BY o)          -- running total
avg(x) OVER (ORDER BY d ROWS 6 PRECEDING)        -- 7-row moving average
```

Filter on a window result: wrap in a CTE/subquery, then `WHERE rn = 1`.

## CTEs

```sql
WITH a AS (...), b AS (SELECT ... FROM a) SELECT ... FROM b;

WITH RECURSIVE tree AS (
  SELECT id, parent_id, 1 AS depth FROM nodes WHERE parent_id IS NULL   -- anchor
  UNION ALL
  SELECT n.id, n.parent_id, t.depth + 1 FROM nodes n JOIN tree t ON n.parent_id = t.id
)
SELECT * FROM tree;
```

## Dates

```sql
now()  current_date  date_trunc('month', ts)  extract(year FROM ts)
to_char(ts, 'YYYY-MM-DD HH24:MI')  ts::date  ts + interval '1 day'
age(a, b)   b - a  (→ interval)   ts AT TIME ZONE 'Europe/Berlin'
generate_series('2026-01-01'::date, '2026-06-01', interval '1 month')   -- calendar rows
```

## Strings

```sql
lower upper length trim left right substring position replace
split_part(s, '@', 2)   s1 || s2   concat_ws(' ', a, b)   format('%s has %s', a, b)
```

## Set operations

`UNION` (dedupe) · `UNION ALL` (keep all, faster) · `INTERSECT` · `EXCEPT`. Columns must line up by position and type.

## Writing

```sql
INSERT INTO t (a, b) VALUES (1, 'x'), (2, 'y') RETURNING id;
INSERT ... ON CONFLICT (a) DO NOTHING;
INSERT ... ON CONFLICT (a) DO UPDATE SET b = EXCLUDED.b RETURNING *;
UPDATE t SET b = 'z' WHERE a = 1 RETURNING *;
DELETE FROM t WHERE a = 1 RETURNING *;
UPDATE t SET ... FROM other o WHERE o.id = t.other_id;   -- update with a join
```

Safety: `BEGIN;` → run → check the row count → `COMMIT;` or `ROLLBACK;`.

## psql

`\dt` tables · `\d t` describe · `\x auto` expanded · `\timing on` · `\i file.sql` · `\e` editor ·
`\pset null ∅` · `\h SELECT` · `\q`.
