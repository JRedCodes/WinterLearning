# Postgres for backend engineers: Phase 2 cheat sheet

Everything from modules 11–15 that you'll reach for while building the checkpoint, on one page.

## DDL patterns

```sql
id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY
price_cents bigint NOT NULL CHECK (price_cents >= 0)
status      text   NOT NULL DEFAULT 'reserved' CHECK (status IN ('reserved', 'cancelled'))
created_at  timestamptz NOT NULL DEFAULT now()
PRIMARY KEY (warehouse_id, product_id)                                   -- composite natural key
REFERENCES orders (id) ON DELETE CASCADE                                  -- child rows die with parent
CREATE UNIQUE INDEX users_email_key ON users (lower(email));              -- case-insensitive unique
CREATE INDEX ON orders (customer_id, created_at DESC, id DESC);           -- filter + sort
CREATE INDEX ON products USING gin (name gin_trgm_ops);                   -- substring search
CREATE INDEX ON jobs (run_at) WHERE status = 'ready';                     -- partial index
CREATE INDEX CONCURRENTLY ...;                                            -- no write lock (not in a txn)
```

## node-postgres

```ts
import pg from "pg";
const pool = new pg.Pool({ connectionString, max: 10, connectionTimeoutMillis: 2000 });

await pool.query("SELECT * FROM products WHERE id = $1", [id]);        // one-off, auto-commit
const { rows, rowCount } = await pool.query<Row>(sql, params);

// arrays: = ANY and unnest
await db.query("SELECT * FROM products WHERE id = ANY($1::bigint[])", [ids]);
await db.query(
  "INSERT INTO order_lines (order_id, product_id, quantity) SELECT $1, * FROM unnest($2::bigint[], $3::int[])",
  [orderId, productIds, quantities],
);

// bigint / numeric arrive as strings
const n = Number(row.total_cents);   // check Number.isSafeInteger for safety
await pool.end();                    // on shutdown
```

## Transaction helper

```ts
export async function withTransaction<T>(pool: pg.Pool, fn: (tx: pg.PoolClient) => Promise<T>) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
```

## Concurrency-safe statements

```sql
UPDATE stock_levels SET available = available - $3
 WHERE warehouse_id = $1 AND product_id = $2 AND available >= $3;           -- reserve (rowCount 0 = no)
UPDATE orders SET status = 'cancelled' WHERE id = $1 AND status = 'reserved' RETURNING *;  -- transition once
INSERT INTO stock_levels (...) VALUES (...)
  ON CONFLICT (warehouse_id, product_id) DO UPDATE SET available = EXCLUDED.available;     -- upsert
SELECT id FROM wallets WHERE id = ANY($1) ORDER BY id FOR UPDATE;          -- lock several, in order
SELECT ... FOR UPDATE SKIP LOCKED LIMIT 10;                                -- work queue
```

## Pagination & search

```sql
-- keyset, newest first (fetch limit + 1)
WHERE ($3::timestamptz IS NULL OR (created_at, id) < ($3, $4))
ORDER BY created_at DESC, id DESC LIMIT $5

-- substring search with escaped user input (escape \ % _ in JS first)
WHERE name ILIKE $1          -- $1 = '%' + escaped + '%'
```

## Error codes to map

| Code | Meaning | Typical mapping |
|---|---|---|
| `23505` | unique_violation (`err.constraint` has the index name) | 409 DUPLICATE_* |
| `23503` | foreign_key_violation | 404 / 409 (prefer explicit existence checks) |
| `23514` | check_violation | 409 / 422 domain error |
| `22P02` | invalid_text_representation (e.g. bad integer) | validate earlier → 400 |
| `40P01` | deadlock_detected | fix lock order; retry |
| `40001` | serialization_failure | retry whole transaction |

## EXPLAIN quick read

```sql
EXPLAIN (ANALYZE, BUFFERS) SELECT ...;
```

- `Seq Scan` on a big table in a hot query → missing or unusable index
- `Index Scan` / `Index Only Scan` → good; `Bitmap Index Scan` → good for many matches
- `rows=` estimate vs `actual rows=` far apart → `ANALYZE table`
- `Sort` above an index scan → the index doesn't match your `ORDER BY`

## psql

```text
\dt                 list tables          \d+ orders     table + indexes + constraints
\di                 list indexes         \dx            installed extensions
\x auto             expanded output      \timing on     show query times
\e                  edit query in $EDITOR
```

## Debug live

```sql
SELECT pid, state, now() - xact_start AS age, pg_blocking_pids(pid), left(query, 80)
  FROM pg_stat_activity WHERE datname = current_database();
SELECT * FROM schema_migrations ORDER BY name;
```
