# SQL & psql cheat sheet (Postgres 16)

> Queries, schema, indexes, transactions and psql. Taught in [11 · SQL Fundamentals](../../11-sql-fundamentals/README.md) through [16 · Checkpoint: Postgres](../../16-checkpoint-postgres/README.md).

## Connect

```bash
make psql                                                     # where the module's Makefile has it
docker compose exec postgres psql -U postgres -d wl_13        # inside the container
psql postgres://postgres:postgres@localhost:5433/wl_13        # local psql client, host port 5433
```

Each module has its own database `wl_NN` (tests create it if missing).

## psql meta-commands

| Command | Does |
|---|---|
| `\l` | list databases |
| `\c wl_13` | connect to another database |
| `\dt` / `\dt+` | list tables (with sizes) |
| `\d tasks` | describe a table: columns, indexes, constraints, FKs |
| `\di` | list indexes |
| `\dn` / `\df` | schemas / functions |
| `\x auto` | expanded output for wide rows |
| `\timing on` | show query time |
| `\e` | edit the last query in `$EDITOR` |
| `\i file.sql` | run a file |
| `\copy t TO 'out.csv' CSV HEADER` | client-side export |
| `\q` | quit |

## Querying

```sql
SELECT id, title FROM tasks
WHERE status = 'open' AND due_at < now()
ORDER BY due_at ASC NULLS LAST, id
LIMIT 20;

SELECT * FROM users WHERE email ILIKE '%@example.com';   -- case-insensitive match
SELECT * FROM orders WHERE customer_id = ANY($1::bigint[]); -- batch lookup from Node
SELECT DISTINCT ON (customer_id) * FROM orders ORDER BY customer_id, created_at DESC; -- latest per customer
```

## NULL rules

- `NULL = NULL` is NULL (not true). Use `IS NULL` / `IS NOT NULL` / `IS DISTINCT FROM`.
- `COUNT(*)` counts rows; `COUNT(col)` skips NULLs.
- `COALESCE(x, 0)` replaces NULL. `NULLIF(x, 0)` turns 0 into NULL (avoid divide-by-zero).
- `NOT IN (subquery)` returns nothing if the subquery has a NULL. Prefer `NOT EXISTS`.

## Joins

```sql
-- inner: only matching rows
SELECT o.id, c.name FROM orders o JOIN customers c ON c.id = o.customer_id;
-- left: all customers, orders if any
SELECT c.name, o.id FROM customers c LEFT JOIN orders o ON o.customer_id = c.id;
-- anti-join: customers with no orders
SELECT c.* FROM customers c
WHERE NOT EXISTS (SELECT 1 FROM orders o WHERE o.customer_id = c.id);
```

## Aggregates, CTEs, windows

```sql
SELECT customer_id, COUNT(*) AS n, SUM(total_cents) AS spent
FROM orders GROUP BY customer_id HAVING COUNT(*) >= 3;

WITH recent AS (
  SELECT * FROM orders WHERE created_at > now() - interval '30 days'
)
SELECT customer_id, SUM(total_cents) FROM recent GROUP BY 1;

SELECT id, customer_id, total_cents,
  ROW_NUMBER() OVER (PARTITION BY customer_id ORDER BY created_at) AS nth_order,
  SUM(total_cents) OVER (PARTITION BY customer_id ORDER BY created_at) AS running_total,
  LAG(created_at) OVER (PARTITION BY customer_id ORDER BY created_at) AS prev_order_at
FROM orders;

WITH RECURSIVE tree AS (                              -- category hierarchy
  SELECT id, parent_id, name, 1 AS depth FROM categories WHERE parent_id IS NULL
  UNION ALL
  SELECT c.id, c.parent_id, c.name, t.depth + 1 FROM categories c JOIN tree t ON c.parent_id = t.id
)
SELECT * FROM tree;
```

## Writing data

```sql
INSERT INTO tasks (title, project_id) VALUES ($1, $2) RETURNING *;
INSERT INTO users (email) VALUES ($1)
  ON CONFLICT (email) DO UPDATE SET last_seen_at = now()   -- upsert
  RETURNING id;
INSERT INTO tags (name) VALUES ($1) ON CONFLICT DO NOTHING;
UPDATE products SET stock = stock - $2 WHERE id = $1 AND stock >= $2 RETURNING stock;  -- atomic decrement
DELETE FROM sessions WHERE expires_at < now();
```

## Schema & constraints

```sql
CREATE TABLE bookings (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  room_id     bigint NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  user_id     bigint NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  starts_at   timestamptz NOT NULL,
  ends_at     timestamptz NOT NULL,
  price_cents integer NOT NULL CHECK (price_cents >= 0),
  meta        jsonb NOT NULL DEFAULT '{}',
  created_at  timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at)
);
CREATE UNIQUE INDEX users_email_lower_uq ON users (lower(email));      -- case-insensitive unique
CREATE EXTENSION IF NOT EXISTS btree_gist;
ALTER TABLE bookings ADD CONSTRAINT no_overlap
  EXCLUDE USING gist (room_id WITH =, tstzrange(starts_at, ends_at) WITH &&);
```

Types: `text` (not `varchar(n)` unless the limit is a real rule), `numeric(12,2)` or integer cents for money, `timestamptz` always, `jsonb` for flexible attributes, `uuid` or `bigint identity` for keys.

## Indexes & EXPLAIN

```sql
CREATE INDEX CONCURRENTLY posts_author_created_idx ON posts (author_id, created_at DESC);
CREATE INDEX ON orders (customer_id) INCLUDE (total_cents);    -- covering
CREATE INDEX ON tasks (due_at) WHERE status = 'open';          -- partial
EXPLAIN ANALYZE SELECT * FROM posts WHERE author_id = 42 ORDER BY created_at DESC LIMIT 20;
EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ...;
ANALYZE posts;                                                 -- refresh planner statistics
```

Read plans bottom-up. Watch for `Seq Scan` on big tables, row estimates far from actual, and `Sort` nodes spilling to disk. Composite index order: equality columns first, then range/sort columns.

Keyset pagination (instead of a deep `OFFSET`):

```sql
SELECT * FROM posts WHERE (created_at, id) < ($1, $2) ORDER BY created_at DESC, id DESC LIMIT 20;
```

## Transactions & locking

```sql
BEGIN;
SELECT * FROM seats WHERE id = $1 FOR UPDATE;          -- lock the row until COMMIT
UPDATE seats SET held_by = $2 WHERE id = $1;
COMMIT;                                                -- or ROLLBACK;

BEGIN ISOLATION LEVEL SERIALIZABLE;                    -- retry on SQLSTATE 40001
SELECT * FROM jobs WHERE status = 'ready' ORDER BY id LIMIT 10 FOR UPDATE SKIP LOCKED; -- worker queue
SELECT pg_advisory_xact_lock(hashtext('migrate'));     -- app-level mutex
```

Useful error codes from `pg` (`err.code`): `23505` unique violation, `23503` FK violation, `23514` check violation, `23P01` exclusion violation, `40001` serialization failure, `40P01` deadlock.

## Debugging live

```sql
SELECT pid, state, wait_event_type, now() - query_start AS age, query
FROM pg_stat_activity WHERE datname = 'wl_15';
SELECT pg_cancel_backend(<pid>);                       -- cancel a query
SELECT relname, n_live_tup FROM pg_stat_user_tables ORDER BY 2 DESC;
SELECT pg_size_pretty(pg_total_relation_size('posts'));
```

## Gotchas

- Always use parameters (`$1`), never string concatenation: SQL injection.
- Postgres folds unquoted identifiers to lowercase. `"createdAt"` and `createdAt` are different columns. Use snake_case.
- `BETWEEN` on timestamps is inclusive on both ends; prefer `>= start AND < end`.
- `timestamp` (without tz) silently drops time zone info. Use `timestamptz`.
- `CREATE INDEX` without `CONCURRENTLY` blocks writes on a big table.
- `count(*)` on a huge table is slow (MVCC); use estimates for dashboards.
- An idle transaction holds locks and a pool connection. Always `COMMIT`/`ROLLBACK` in `finally`.
