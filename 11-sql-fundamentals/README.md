# 11 · SQL Fundamentals

> Every backend you'll work on stores its important data in a database, and most of those speak SQL. ORMs and query builders help, but when a page is slow, a report is wrong or an incident needs answers *now*, the engineer who can write the query by hand is the one who fixes it.

**Time:** ~7h · **Challenge:** 🛠️ Build · **Prereqs:** [00 · Dev Environment](../00-dev-environment/README.md) (Docker + `make up`) · **Services:** 🐘 Postgres

## What you'll learn

- The relational model: tables, rows, keys, and why SQL describes *what* you want rather than *how* to get it
- The order Postgres actually evaluates a `SELECT` in, and why that explains half of all SQL errors
- Filtering, sorting and paging: `WHERE`, `ORDER BY`, `LIMIT`/`OFFSET`
- `NULL` and three-valued logic, the source of many subtle bugs
- Joins: inner, left, full, self-joins and anti-joins, and how joins multiply rows
- Aggregation with `GROUP BY` / `HAVING`, and the difference between `count(*)` and `count(col)`
- Subqueries, CTEs (`WITH`) and recursive CTEs for trees
- Window functions: `row_number`, `rank`, `lag`, running totals and partitions
- `CASE`, date/time and string functions, set operations
- Writing data: `INSERT … ON CONFLICT` (upsert), `UPDATE`/`DELETE … RETURNING`
- Getting around in `psql`

---

## 1. The relational model in ten minutes

A relational database stores data in **tables** (relations). A table has a fixed set of named, typed **columns** and any number of **rows**. Each row is one fact: "customer 4 is Dev Patel, city unknown".

Tables point at each other with **keys**:

- A **primary key** uniquely identifies a row (`customers.id`).
- A **foreign key** is a column whose value must exist as a key in another table (`orders.customer_id → customers.id`).

Here's the dataset you'll query all module, a small online shop called *Shopfront*:

```mermaid
erDiagram
  categories ||--o{ categories : "parent_id"
  categories ||--o{ products : "category_id"
  customers  ||--o{ orders : places
  orders     ||--|{ order_items : contains
  products   ||--o{ order_items : "appears in"
  customers  ||--o{ reviews : writes
  products   ||--o{ reviews : receives

  customers {
    int id PK
    text email
    text full_name
    text city "nullable"
    timestamptz created_at
  }
  products {
    int id PK
    text name
    int category_id FK "nullable"
    numeric price
    boolean active
  }
  orders {
    int id PK
    int customer_id FK
    text status
    timestamptz ordered_at
    timestamptz shipped_at "nullable"
  }
  order_items {
    int order_id PK
    int product_id PK
    int quantity
    numeric unit_price
  }
```

Two ideas matter more than the syntax:

1. **SQL is declarative.** You describe the result you want ("customers in Berlin, newest first"). The database's **planner** decides how to get it: which index to use, which join algorithm, in what order. That's why the same query can be fast or slow depending on indexes and data ([module 14](../14-query-performance/README.md) is all about this).
2. **Everything is a table.** A query's result is itself a table, so you can join it, filter it, or wrap it in another query. Subqueries, CTEs and views all come from this one idea.

> 💡 Why does `order_items` exist instead of an array of products on each order? Because "which orders contain product 3?" and "how many units of product 3 did we sell?" become simple queries. Designing tables like this is [module 12](../12-data-modeling/README.md).

## 2. How a SELECT is evaluated

You *write* a query in this order:

```sql
SELECT   c.city, count(*) AS customers
FROM     customers AS c
WHERE    c.created_at >= '2026-01-01'
GROUP BY c.city
HAVING   count(*) > 1
ORDER BY customers DESC
LIMIT    10;
```

But Postgres *logically evaluates* it in a different order:

```mermaid
flowchart LR
  F["FROM / JOIN<br/>build the rows"] --> W["WHERE<br/>filter rows"]
  W --> G["GROUP BY<br/>make groups"]
  G --> H["HAVING<br/>filter groups"]
  H --> S["SELECT<br/>compute columns,<br/>window functions"]
  S --> D["DISTINCT"]
  D --> O["ORDER BY"]
  O --> L["LIMIT / OFFSET"]
```

Keep this picture in your head. It explains a lot of errors:

| Symptom | Why |
|---|---|
| `column "customers" does not exist` in `WHERE customers > 1` | `WHERE` runs before `SELECT`, so the alias doesn't exist yet. Use `HAVING count(*) > 1`. |
| `ORDER BY customers` works | `ORDER BY` runs after `SELECT`, so aliases are visible. |
| `aggregate functions are not allowed in WHERE` | Aggregates are computed during grouping, after `WHERE`. Filter groups with `HAVING`. |
| `window functions are not allowed in WHERE` | Window functions run in the `SELECT` step. Wrap the query in a CTE/subquery and filter outside. |
| `column "o.status" must appear in the GROUP BY clause` | After grouping, each output row is a whole group. A column that isn't grouped has many possible values per group. |

(The planner is free to execute things in another physical order, for example pushing a filter down into a join, as long as the result is the same.)

## 3. Filtering, sorting and paging

```sql
SELECT id, name, price
FROM products
WHERE active
  AND price BETWEEN 20 AND 100          -- inclusive on both ends
  AND name ILIKE '%key%'                -- case-insensitive pattern
  AND category_id IN (4, 7)
ORDER BY price DESC, name               -- tie-breaker!
LIMIT 10 OFFSET 20;                      -- page 3 of 10
```

Rules worth tattooing somewhere:

- **Without `ORDER BY`, row order is undefined.** It may look stable on your laptop and change in production after a `VACUUM` or a new index. If order matters, say so.
- **Always add a tie-breaker.** `ORDER BY price` with two products at 39.50 can return them in either order, and with `LIMIT` that means a row may appear on two pages or on none. Add a unique column last (`ORDER BY price, id`).
- `LIKE` is case-sensitive, `ILIKE` isn't (Postgres-specific). `%` matches any run of characters, `_` exactly one.
- `OFFSET` makes the database produce and throw away all skipped rows, so page 10,000 is slow. The fix, keyset pagination, is in [module 14](../14-query-performance/README.md).
- Strings use **single quotes** (`'Berlin'`). Double quotes are for identifiers (`"Order"`). Mixing them up gives you `column "Berlin" does not exist`.

## 4. NULL: the value that isn't

`NULL` means "unknown" or "not applicable". It's not zero, not an empty string, not false. Comparisons with an unknown value give an unknown result, so SQL has **three-valued logic**: `true`, `false`, `null`.

```sql
SELECT NULL = NULL;        -- null   (is unknown equal to unknown? unknown!)
SELECT NULL <> 1;          -- null
SELECT NULL AND false;     -- false  (false regardless of the unknown)
SELECT NULL OR true;       -- true
SELECT 5 + NULL;           -- null   (NULL spreads through expressions)
```

`WHERE` keeps a row only if the condition is **true**. Null counts as "not true", so it's dropped. Consequences:

```sql
WHERE city = NULL          -- never matches anything. Use: city IS NULL
WHERE city <> 'Berlin'     -- does NOT return customers with a NULL city!
WHERE city IS DISTINCT FROM 'Berlin'   -- null-safe "not equal": includes NULLs
```

Tools for dealing with it:

| Tool | Does |
|---|---|
| `x IS NULL` / `x IS NOT NULL` | the only correct test for null |
| `coalesce(a, b, c)` | first non-null argument: `coalesce(city, 'unknown')` |
| `nullif(a, b)` | null if `a = b`, else `a`. Classic use: `total / nullif(count, 0)` avoids division by zero |
| `IS DISTINCT FROM` | comparison that treats null as a normal value |

**Aggregates skip nulls** (except `count(*)`):

```sql
SELECT count(*)    AS rows,          -- counts rows
       count(body) AS with_text,     -- counts non-null bodies
       avg(rating) AS avg_rating     -- average of the non-null ratings
FROM reviews;
```

And `sum`/`avg`/`max` of zero rows (or only nulls) is `NULL`, not 0. Wrap with `coalesce(sum(x), 0)` when you want a number.

> ⚠️ **The `NOT IN` trap.** `WHERE id NOT IN (SELECT parent_id FROM categories)` returns **no rows at all** if any `parent_id` is null, because `id <> NULL` is unknown for every row. Prefer `NOT EXISTS` for "rows without a match". It handles nulls the way you'd expect.

## 5. Joins

A join combines rows from two tables where a condition holds. Think of it as: for every pair of rows (one from each side), keep the pair if `ON` is true.

```sql
SELECT o.id, c.full_name, o.status
FROM orders    AS o
JOIN customers AS c ON c.id = o.customer_id;
```

| Join | Keeps |
|---|---|
| `[INNER] JOIN` | only pairs that match |
| `LEFT [OUTER] JOIN` | every row of the left table; right side columns are `NULL` when there's no match |
| `RIGHT JOIN` | mirror of left (rarely used: just swap the tables) |
| `FULL [OUTER] JOIN` | every row of both sides, nulls where either side has no match |
| `CROSS JOIN` | every combination (n × m rows); useful for generating grids |

```mermaid
flowchart LR
  subgraph INNER["INNER JOIN"]
    i1["customers with orders<br/>× their orders"]
  end
  subgraph LEFT["LEFT JOIN"]
    l1["all customers<br/>+ orders or NULLs"]
  end
  subgraph ANTI["ANTI-JOIN"]
    a1["customers with<br/>NO orders"]
  end
```

See [docs/joins-visual-guide.md](docs/joins-visual-guide.md) for worked examples with actual rows.

### Joins multiply rows

The most important thing to understand about joins: **a row on one side appears once per matching row on the other side.** Join `orders` to `order_items` and an order with three items becomes three rows. That's how you get line-level data, and it's also how you get wrong totals:

```sql
-- ❌ counts order ITEMS, not orders
SELECT count(*) FROM orders o JOIN order_items oi ON oi.order_id = o.id;

-- ✅ count each order once
SELECT count(DISTINCT o.id) FROM orders o JOIN order_items oi ON oi.order_id = o.id;
```

Whenever a number looks too big, ask "did a join multiply my rows?"

### LEFT JOIN pitfalls

```sql
-- Every customer and how many orders they placed, including zero
SELECT c.full_name, count(o.id) AS orders     -- count(o.id), not count(*)!
FROM customers c
LEFT JOIN orders o ON o.customer_id = c.id
GROUP BY c.id, c.full_name;
```

- `count(*)` would count the null-padded row of a customer without orders as 1. `count(o.id)` skips the null.
- **A condition on the right table in `WHERE` silently turns a LEFT JOIN into an INNER JOIN**:

```sql
-- ❌ customers without a 2026 order disappear: their o.ordered_at is NULL, and NULL >= ... isn't true
SELECT c.full_name, o.id FROM customers c
LEFT JOIN orders o ON o.customer_id = c.id
WHERE o.ordered_at >= '2026-01-01';

-- ✅ put the right-side filter in ON: it decides which orders match, not which customers survive
SELECT c.full_name, o.id FROM customers c
LEFT JOIN orders o ON o.customer_id = c.id AND o.ordered_at >= '2026-01-01';
```

### Anti-joins and semi-joins

"Rows in A with **no** match in B" is an **anti-join**. "Rows in A with **at least one** match in B" is a **semi-join**. Write them with `EXISTS`:

```sql
-- customers who never placed an order (anti-join)
SELECT c.* FROM customers c
WHERE NOT EXISTS (SELECT 1 FROM orders o WHERE o.customer_id = c.id);

-- customers who wrote at least one review (semi-join): no duplicates, unlike a JOIN
SELECT c.* FROM customers c
WHERE EXISTS (SELECT 1 FROM reviews r WHERE r.customer_id = c.id);
```

The alternative `LEFT JOIN … WHERE o.id IS NULL` also works. `EXISTS` states the intent more clearly, and Postgres plans both well.

### Self-joins

A table can be joined to itself with two aliases. The category tree is the classic example:

```sql
SELECT child.name AS category, parent.name AS parent
FROM categories child
LEFT JOIN categories parent ON parent.id = child.parent_id;
```

That gets you one level up. For "all the way up", you need a recursive CTE (section 8).

## 6. Aggregation: GROUP BY and HAVING

Aggregate functions collapse many rows into one value: `count`, `sum`, `avg`, `min`, `max`, `string_agg`, `array_agg`, `bool_and`…

`GROUP BY` splits rows into groups and produces **one output row per group**:

```sql
SELECT o.customer_id,
       count(*)                          AS orders,
       min(o.ordered_at)                 AS first_order,
       sum(oi.quantity * oi.unit_price)  AS spent
FROM orders o
JOIN order_items oi ON oi.order_id = o.id
WHERE o.status <> 'cancelled'            -- filters ROWS, before grouping
GROUP BY o.customer_id
HAVING sum(oi.quantity * oi.unit_price) > 500   -- filters GROUPS, after grouping
ORDER BY spent DESC;
```

(Spot the bug? `count(*)` there counts *items*, because of the join. See section 5.)

Rules:

- Every column in `SELECT` must be either inside an aggregate or listed in `GROUP BY`. Postgres relaxes this when you group by a table's primary key: `GROUP BY c.id` lets you select `c.full_name` too, because the key determines it.
- `WHERE` vs `HAVING`: if the condition is about individual rows, use `WHERE` (it's cheaper because fewer rows get grouped). If it's about the group's aggregate, use `HAVING`.
- Aggregates can take `DISTINCT` and `ORDER BY`: `count(DISTINCT customer_id)`, `string_agg(name, ', ' ORDER BY name)`.
- `FILTER` computes several conditional aggregates in one pass, a very handy Postgres feature:

```sql
SELECT count(*) FILTER (WHERE status = 'delivered') AS delivered,
       count(*) FILTER (WHERE status = 'cancelled') AS cancelled
FROM orders;
```

## 7. Subqueries and CTEs

A subquery is a query inside another query. Because a result is a table, a subquery can go almost anywhere:

```sql
-- scalar subquery: returns exactly one value
SELECT name, price, price - (SELECT avg(price) FROM products) AS vs_avg FROM products;

-- in FROM ("derived table"): must have an alias
SELECT t.status, t.n FROM (SELECT status, count(*) AS n FROM orders GROUP BY status) AS t;

-- with IN / EXISTS
SELECT * FROM products WHERE category_id IN (SELECT id FROM categories WHERE parent_id = 2);
```

A **correlated subquery** references the outer row, so conceptually it runs once per outer row:

```sql
-- each customer's most recent order date
SELECT c.full_name,
       (SELECT max(o.ordered_at) FROM orders o WHERE o.customer_id = c.id) AS last_order
FROM customers c;
```

### CTEs: name your steps

A **common table expression** (`WITH`) gives a subquery a name, so you can build a query in readable steps:

```sql
WITH order_totals AS (
  SELECT o.id, o.customer_id, sum(oi.quantity * oi.unit_price) AS total
  FROM orders o JOIN order_items oi ON oi.order_id = o.id
  GROUP BY o.id
),
customer_totals AS (
  SELECT customer_id, count(*) AS orders, avg(total) AS avg_order
  FROM order_totals
  GROUP BY customer_id
)
SELECT c.full_name, ct.orders, round(ct.avg_order, 2) AS avg_order
FROM customer_totals ct
JOIN customers c ON c.id = ct.customer_id;
```

Notice how `order_totals` fixes the row multiplication problem: aggregate items to one row per order *first*, then aggregate orders. "Aggregate at the right grain, then join" is a pattern you'll use constantly.

Since Postgres 12, simple CTEs are inlined into the main query, so they're not an optimization barrier anymore. Use them for readability freely. (`WITH x AS MATERIALIZED (...)` forces the old compute-once behavior when you need it.)

## 8. Recursive CTEs

Some data is a **tree** or **graph** stored as rows that point at their parent: categories, org charts, comment threads, folder structures. A recursive CTE walks it:

```sql
WITH RECURSIVE ancestors AS (
  -- 1. anchor: where to start
  SELECT id, name, parent_id, 0 AS steps_up
  FROM categories
  WHERE name = 'Laptops'
  UNION ALL
  -- 2. recursive step: join the previous level to the next one
  SELECT p.id, p.name, p.parent_id, a.steps_up + 1
  FROM categories p
  JOIN ancestors a ON p.id = a.parent_id
)
SELECT name, steps_up FROM ancestors;
--  Laptops 0 · Computers 1 · Electronics 2
```

```mermaid
flowchart TB
  A["anchor rows<br/>(Laptops)"] --> R1["iteration 1: join → Computers"]
  R1 --> R2["iteration 2: join → Electronics"]
  R2 --> R3["iteration 3: join → no rows → stop"]
```

How it runs: evaluate the anchor; then repeatedly run the recursive part using **only the rows produced in the previous iteration**, appending results, until an iteration produces nothing.

That example walks *up*. Walking *down* (from a root to all descendants) just flips the join: `JOIN tree t ON child.parent_id = t.id`. You can carry values along each step, like a running path string or the id of the root you started from, which is how you "roll up" totals to top-level categories.

> ⚠️ A cycle in the data (A → B → A) makes a naive recursive CTE loop forever. Guard with a depth limit (`WHERE depth < 20`), track visited ids in an array (`NOT c.id = ANY(path_ids)`), or use Postgres 14+'s `CYCLE` clause.

## 9. Window functions

Aggregates collapse rows. **Window functions compute across related rows but keep every row.** That's the whole idea, and it unlocks a class of questions that are painful otherwise: rankings, top-N per group, running totals, comparing a row to the previous one.

```sql
SELECT id, customer_id, ordered_at,
       row_number() OVER (PARTITION BY customer_id ORDER BY ordered_at) AS nth_order
FROM orders;
```

Anatomy of `OVER (...)`:

- `PARTITION BY` splits rows into independent groups (like `GROUP BY`, but rows aren't collapsed). Omit it and the whole result is one partition.
- `ORDER BY` orders rows within each partition. Ranking and `lag`/`lead` need it. For aggregates it turns them into *running* aggregates.
- An optional **frame** (`ROWS BETWEEN 6 PRECEDING AND CURRENT ROW`) says which rows around the current one an aggregate sees, which gives you moving averages.

| Function | Gives |
|---|---|
| `row_number()` | 1, 2, 3, 4 (unique, ties broken arbitrarily unless you add a tie-breaker) |
| `rank()` | 1, 2, 2, 4 (ties share, then a gap) |
| `dense_rank()` | 1, 2, 2, 3 (ties share, no gap) |
| `lag(x)` / `lead(x)` | `x` from the previous / next row in the partition |
| `first_value(x)` / `last_value(x)` | first / last in the frame (watch the default frame for `last_value`) |
| `sum(x) OVER (...)`, `avg`, `count` … | any aggregate, over the window |
| `ntile(4)` | bucket number (quartiles) |

Two patterns you'll write over and over:

```sql
-- Top-1 per group: each customer's FIRST order
WITH numbered AS (
  SELECT o.*, row_number() OVER (PARTITION BY customer_id ORDER BY ordered_at) AS rn
  FROM orders o
)
SELECT * FROM numbered WHERE rn = 1;   -- filter OUTSIDE: windows aren't allowed in WHERE

-- Running total of daily signups
SELECT created_at::date AS day,
       count(*) AS signups,
       sum(count(*)) OVER (ORDER BY created_at::date) AS total_so_far
FROM customers
GROUP BY created_at::date;
```

That second query nests an aggregate inside a window function. It works because of the evaluation order from section 2: `GROUP BY` produces one row per day, then the window runs over those grouped rows.

Postgres also has `DISTINCT ON`, a handy shortcut for top-1 per group: `SELECT DISTINCT ON (customer_id) * FROM orders ORDER BY customer_id, ordered_at DESC`.

Deep dive with more examples and the frame rules: [docs/window-functions-guide.md](docs/window-functions-guide.md).

## 10. The everyday toolbox

### CASE

`CASE` is SQL's if/else, and it's an expression, so it works in `SELECT`, `ORDER BY`, `GROUP BY` and inside aggregates:

```sql
SELECT name,
       CASE WHEN stock = 0 THEN 'sold out'
            WHEN stock < 5 THEN 'low'
            ELSE 'ok' END AS availability
FROM inventory;
```

Branches are checked top to bottom and the first true one wins, so order the conditions from most to least specific. No match and no `ELSE` gives `NULL`.

### Dates and times

Use `timestamptz` for moments in time (more in [module 12](../12-data-modeling/README.md)). Useful pieces:

```sql
SELECT now();                                   -- start of the current transaction
SELECT date_trunc('month', ordered_at);         -- 2026-03-15 17:00 → 2026-03-01 00:00
SELECT extract(dow FROM ordered_at);            -- day of week, 0 = Sunday
SELECT to_char(ordered_at, 'YYYY-MM');          -- format as text: '2026-03'
SELECT shipped_at - ordered_at AS took;         -- an interval: '1 day 23:00:00'
SELECT now() - interval '30 days';              -- arithmetic with intervals
SELECT ordered_at::date;                        -- cast to a date
SELECT ordered_at AT TIME ZONE 'Europe/Berlin'; -- view a moment in a zone
```

To select a period, use a **half-open range**:

```sql
WHERE ordered_at >= '2026-03-01' AND ordered_at < '2026-04-01'    -- ✅ all of March
WHERE ordered_at BETWEEN '2026-03-01' AND '2026-03-31'           -- ❌ misses March 31 after 00:00
```

It also lets an index on `ordered_at` be used, while `WHERE date_trunc('month', ordered_at) = …` usually can't (module 14 explains why).

> ⚠️ `date_trunc` and `::date` on a `timestamptz` use the **session time zone**. A 23:30 UTC order is "tomorrow" in Berlin. Reports must pick a zone deliberately. The tests run with `TimeZone = 'UTC'`.

### Strings

```sql
lower(email), upper(x), length(x), trim(x)
split_part('dev@example.com', '@', 2)   -- 'example.com'
'Hello, ' || full_name                  -- concatenation (NULL || 'x' is NULL!)
concat_ws(' ', first, middle, last)     -- joins with a separator, skips NULLs
substring(name FROM 1 FOR 3), left(name, 3), replace(x, 'a', 'b')
position('@' IN email)
string_agg(name, ', ' ORDER BY name)    -- aggregate: many rows → one string
```

### Set operations

Combine the results of two queries that have the same number and types of columns:

```sql
SELECT customer_id FROM orders
UNION                -- in either; duplicates removed (UNION ALL keeps them, and is faster)
SELECT customer_id FROM reviews;

-- INTERSECT: in both · EXCEPT: in the first but not the second
```

`UNION ALL` is what you usually want when you know the parts don't overlap. Plain `UNION` has to sort or hash everything to remove duplicates.

## 11. Writing data

You'll mostly write data through application code (module 13), but the SQL is the same.

```sql
INSERT INTO customers (id, email, full_name) VALUES (13, 'mo@example.com', 'Mo Salah')
RETURNING id, created_at;                       -- get generated values back, no second query

UPDATE orders SET status = 'shipped', shipped_at = now()
WHERE id = 19 AND status = 'paid'               -- the WHERE is your safety net
RETURNING id, status;

DELETE FROM reviews WHERE id = 14 RETURNING *;
```

- **`UPDATE` / `DELETE` without `WHERE` hits every row.** In `psql`, run `BEGIN;` first, check the row count it reports, then `COMMIT` or `ROLLBACK`.
- **`RETURNING`** hands back the affected rows. It saves a round trip, and it's the only reliable way to learn database-generated ids and defaults.

### Upsert: INSERT … ON CONFLICT

"Insert this, or update it if it already exists" is extremely common: syncing data, counters, settings, idempotent writes. Doing it as "SELECT, then INSERT or UPDATE" in application code is racy: two requests can both see "doesn't exist" and both insert. Postgres does it atomically:

```sql
INSERT INTO product_views (product_id, day, views)
VALUES (3, current_date, 1)
ON CONFLICT (product_id, day)                 -- needs a UNIQUE constraint or index on these columns
DO UPDATE SET views = product_views.views + EXCLUDED.views
RETURNING views;
```

- The conflict target (`(product_id, day)`) must match a unique constraint or unique index.
- `EXCLUDED` is the row you *tried* to insert. The table name (`product_views.views`) is the existing row.
- `ON CONFLICT DO NOTHING` skips duplicates silently. Note that `RETURNING` then returns nothing for the skipped rows.
- One statement can upsert many rows (`VALUES (...), (...)`), but it can't touch the same key twice in one statement.

## 12. psql survival kit

`psql` is the Postgres command-line client. In this module: `make psql` (or `psql postgres://postgres:postgres@localhost:5433/wl_11`).

| Command | Does |
|---|---|
| `\dt` | list tables |
| `\d orders` | describe a table: columns, types, indexes, constraints, foreign keys |
| `\x auto` | expanded display for wide rows |
| `\timing on` | show how long each query took |
| `\e` | open the last query in your `$EDITOR` |
| `\i queries/07_orders_per_customer.sql` | run a file |
| `\pset null ∅` | make NULLs visible instead of blank |
| `\?` / `\h SELECT` | help on psql commands / on SQL syntax |
| `\q` | quit |

End statements with `;`. If the prompt changes to `wl_11-#` or `wl_11'#`, psql is waiting for a missing `;` or closing quote. Press Ctrl+C to abandon the statement.

More in [docs/sql-cheatsheet.md](docs/sql-cheatsheet.md) and the repo-wide [SQL cheat sheet](../docs/cheatsheets/sql.md).

## Common mistakes

- `= NULL` instead of `IS NULL`, and forgetting that `<>` filters out NULLs too.
- `NOT IN (subquery)` when the subquery can return NULL: zero rows, no error.
- `count(*)` after a `LEFT JOIN`, which counts the null-padded row as 1.
- Summing or counting after a join that multiplied rows (totals 3× too big). Aggregate at the right grain first.
- Filtering the right-hand table of a `LEFT JOIN` in `WHERE`, which turns it into an inner join.
- `ORDER BY` without a unique tie-breaker, especially with `LIMIT`: nondeterministic results and flaky tests.
- Relying on row order without any `ORDER BY` at all.
- `BETWEEN` for timestamp ranges (misses the last day). Use `>= start AND < next_start`.
- Using a `SELECT` alias in `WHERE`, or an aggregate in `WHERE` instead of `HAVING`.
- `UPDATE`/`DELETE` without `WHERE`. Run destructive statements inside `BEGIN … ROLLBACK` first.
- Read-then-write in application code instead of `ON CONFLICT` (race condition, see module 15).

## In production

- **Ad-hoc SQL is a superpower in incidents.** "How many orders are stuck in `paid` for more than an hour?" is a one-liner if you know SQL, and a support ticket if you don't. Most companies give engineers read access to a replica for exactly this. Never run heavy analytics on the primary during peak hours.
- **Window functions and CTEs power reporting.** Leaderboards, "latest status per entity", funnels, retention cohorts and month-over-month dashboards are all window-function queries. Pushing that work into the database instead of loading everything into Node is usually orders of magnitude faster.
- **Upserts make writes idempotent.** Retried requests, replayed queue messages and sync jobs all rely on `ON CONFLICT` (modules 15, 20 and 33).
- **Determinism matters.** Unordered results and time-zone-dependent date math cause flaky tests and wrong reports. Explicit `ORDER BY` with tie-breakers and explicit time zones are habits worth building now.
- **ORMs don't remove the need for SQL.** Every ORM has an escape hatch to raw SQL, and you'll need it for reporting queries, bulk updates and performance fixes. You'll also need to read the SQL an ORM generates when it's slow (module 14).

## Check yourself

1. Why does `SELECT count(*) AS n FROM orders WHERE n > 1` fail, and how do you fix the intent?
   <details><summary>Answer</summary><code>WHERE</code> is evaluated before <code>SELECT</code> and before aggregation, so neither the alias nor an aggregate is available there. To filter on an aggregate per group, use <code>GROUP BY … HAVING count(*) &gt; 1</code>.</details>
2. A customer has a NULL city. Does `WHERE city <> 'Paris'` return them?
   <details><summary>Answer</summary>No. <code>NULL &lt;&gt; 'Paris'</code> is unknown, and <code>WHERE</code> keeps only true rows. Use <code>city IS DISTINCT FROM 'Paris'</code> or add <code>OR city IS NULL</code>.</details>
3. You join `orders` to `order_items` and `count(*)` gives 34, but there are 22 orders. What happened?
   <details><summary>Answer</summary>The join produces one row per order item, so orders with several items are counted several times. Use <code>count(DISTINCT o.id)</code>, or aggregate items per order first.</details>
4. What's the difference between `rank()` and `row_number()` when two rows tie?
   <details><summary>Answer</summary><code>row_number()</code> gives them different numbers (arbitrarily, unless a tie-breaker is in the ORDER BY). <code>rank()</code> gives them the same rank and skips the next one (1, 2, 2, 4). <code>dense_rank()</code> gives the same rank without the gap (1, 2, 2, 3).</details>
5. Why is `INSERT … ON CONFLICT DO UPDATE` better than "SELECT to check, then INSERT or UPDATE"?
   <details><summary>Answer</summary>The check-then-write version has a race: two concurrent requests can both see "not there" and both insert, causing a duplicate or a unique-violation error. The upsert is a single atomic statement backed by the unique constraint.</details>

## Further reading

- PostgreSQL tutorial (official): https://www.postgresql.org/docs/16/tutorial.html
- Queries (SELECT, joins, CTEs): https://www.postgresql.org/docs/16/queries.html
- Window functions tutorial: https://www.postgresql.org/docs/16/tutorial-window.html
- Window function reference: https://www.postgresql.org/docs/16/functions-window.html
- Aggregate functions: https://www.postgresql.org/docs/16/functions-aggregate.html
- Date/time functions: https://www.postgresql.org/docs/16/functions-datetime.html
- INSERT (including ON CONFLICT): https://www.postgresql.org/docs/16/sql-insert.html
- psql reference: https://www.postgresql.org/docs/16/app-psql.html
- Deep dives in this module: [docs/sql-cheatsheet.md](docs/sql-cheatsheet.md) · [docs/joins-visual-guide.md](docs/joins-visual-guide.md) · [docs/window-functions-guide.md](docs/window-functions-guide.md)

## ➡️ Next: [the challenge](CHALLENGE.md)
