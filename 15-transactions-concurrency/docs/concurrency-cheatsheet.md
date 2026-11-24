# Transactions & concurrency cheat sheet (Postgres)

## Transactions

```sql
BEGIN;                                         -- Read Committed (default)
BEGIN ISOLATION LEVEL REPEATABLE READ;
BEGIN ISOLATION LEVEL SERIALIZABLE READ ONLY DEFERRABLE;  -- long consistent report, no 40001
COMMIT;  ROLLBACK;
SAVEPOINT s1;  ROLLBACK TO SAVEPOINT s1;  RELEASE SAVEPOINT s1;
SET LOCAL lock_timeout = '2s';                 -- only for the current transaction
SET LOCAL statement_timeout = '5s';
SHOW transaction_isolation;
```

## Row locks

```sql
SELECT … FOR UPDATE;               -- exclusive; blocks other FOR UPDATE / UPDATE / DELETE
SELECT … FOR NO KEY UPDATE;        -- what plain UPDATE takes; doesn't block FK checks
SELECT … FOR SHARE;                -- shared; blocks writers
SELECT … FOR KEY SHARE;            -- weakest; what FK checks take
SELECT … FOR UPDATE NOWAIT;        -- error 55P03 instead of waiting
SELECT … FOR UPDATE SKIP LOCKED;   -- skip rows others hold (queues)
SELECT … FOR UPDATE OF t;          -- lock only table t's rows in a join
```

Locks are released at COMMIT/ROLLBACK, never earlier.

## Atomic patterns

```sql
UPDATE t SET n = n + $2 WHERE id = $1;                                  -- counter
UPDATE t SET stock = stock - $2 WHERE id = $1 AND stock >= $2 RETURNING stock;  -- guarded decrement
UPDATE t SET …, version = version + 1 WHERE id = $1 AND version = $2;   -- optimistic
INSERT … ON CONFLICT (k) DO NOTHING RETURNING …;                         -- claim / insert-if-absent
INSERT … ON CONFLICT (k) DO UPDATE SET n = t.n + EXCLUDED.n;             -- upsert counter
SELECT id FROM t WHERE id = ANY($1) ORDER BY id FOR UPDATE;              -- multi-row lock in order
```

## Advisory locks

```sql
SELECT pg_advisory_xact_lock(key bigint);        -- wait; released at txn end
SELECT pg_try_advisory_xact_lock(key bigint);    -- true/false, no wait
SELECT pg_advisory_lock(key); SELECT pg_advisory_unlock(key);  -- session-level (careful with pools)
SELECT hashtextextended('some:name', 0);         -- text → bigint key
```

## Error codes worth catching (`err.code` in node-postgres)

| SQLSTATE | Name | Usually means | Response |
|---|---|---|---|
| `40001` | serialization_failure | RR/Serializable conflict | retry whole txn |
| `40P01` | deadlock_detected | lock cycle | retry, then fix lock order |
| `55P03` | lock_not_available | `NOWAIT` / `lock_timeout` hit | 409/503 or retry later |
| `57014` | query_canceled | `statement_timeout` hit | 503 / investigate |
| `23505` | unique_violation | duplicate key | 409 Conflict |
| `23514` | check_violation | CHECK failed | domain error (e.g. sold out) |
| `23503` | foreign_key_violation | parent missing / still referenced | 404 / 409 |
| `25P02` | in_failed_sql_transaction | you kept querying after an error in the txn | bug: ROLLBACK first |

## node-postgres rules

- A transaction = **one client** from `pool.connect()`. `pool.query()` inside a "transaction" runs elsewhere.
- Always `try { BEGIN … COMMIT } catch { ROLLBACK } finally { release() }`.
- Set `connectionTimeoutMillis` on the pool so exhaustion fails fast instead of hanging.
- `client.release(err)` with an error destroys the connection instead of reusing it; useful if it's in an unknown state.

## Server settings for safety

```sql
ALTER DATABASE app SET idle_in_transaction_session_timeout = '30s';
ALTER DATABASE app SET lock_timeout = '5s';
ALTER DATABASE app SET statement_timeout = '15s';
SHOW deadlock_timeout;    -- 1s default: how long before the deadlock check runs
```

## Debugging queries

```sql
-- who's doing what, oldest transaction first
SELECT pid, state, now() - xact_start AS age, wait_event_type, wait_event, left(query, 80)
  FROM pg_stat_activity WHERE datname = current_database() ORDER BY xact_start NULLS LAST;

-- who blocks whom
SELECT pid, pg_blocking_pids(pid) AS blocked_by, left(query, 80)
  FROM pg_stat_activity WHERE cardinality(pg_blocking_pids(pid)) > 0;

-- locks on a table
SELECT pid, mode, granted FROM pg_locks WHERE relation = 'wallets'::regclass;

-- deadlocks so far
SELECT datname, deadlocks FROM pg_stat_database WHERE datname = current_database();

-- kill a stuck session
SELECT pg_terminate_backend(<pid>);

-- row versions (MVCC)
SELECT xmin, xmax, * FROM wallets WHERE id = 1;
```

## Isolation in one line each

- **Read Committed:** new snapshot per statement; UPDATEs wait and re-check WHERE on the latest row.
- **Repeatable Read:** one snapshot per transaction; concurrent update of a row you modify → 40001.
- **Serializable:** Repeatable Read + dependency tracking; any non-serializable outcome → 40001.
