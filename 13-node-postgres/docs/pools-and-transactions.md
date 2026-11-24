# Pools and transactions: a deeper look

The lesson gave you the rules. This page explains the failure modes behind them, so you can recognize them in a real incident.

## 1. Anatomy of a connection leak

```ts
// Looks innocent.
async function getTaskWithAudit(pool: Pool, id: string) {
  const client = await pool.connect();
  const { rows } = await client.query("SELECT * FROM tasks WHERE id = $1", [id]);
  if (rows.length === 0) throw new TaskNotFoundError(id); // ← client never released
  await client.query("INSERT INTO audit (task_id) VALUES ($1)", [id]);
  client.release();
  return rows[0];
}
```

Every request for a missing task leaks one connection. With `max: 10`, the eleventh such request since boot makes the pool permanently empty. Every later request waits in the pool's queue:

- With the default `connectionTimeoutMillis: 0`, they wait **forever**. The app looks "hung": health checks that don't touch the database still pass, so the orchestrator doesn't restart it.
- With a timeout, they fail with `timeout exceeded when trying to connect`. Annoying, but visible.

How to spot it in production:

```sql
-- Connections that are idle *inside a transaction* are almost always leaks
SELECT pid, application_name, state, now() - state_change AS for, left(query, 60) AS last_query
FROM pg_stat_activity
WHERE datname = current_database()
ORDER BY state_change;
```

`state = 'idle in transaction'` for minutes means someone ran `BEGIN` and never finished. `idle_in_transaction_session_timeout` makes Postgres kill such sessions automatically.

**Prevention:** never call `pool.connect()` without a `try/finally`. Better, don't call it in application code at all: put it in exactly one helper (`withTransaction`) and test that helper thoroughly.

## 2. Why "release exactly once" matters

`release()` twice is also a bug: `pg` throws `Release called on client which has already been released to the pool`. And in older code it could put the same client in the idle list twice, so two requests would share one connection. Structuring the helper with `finally` guarantees one release whatever path you take.

## 3. `release(err)`: destroying a broken connection

```ts
client.release();      // healthy: back to the idle list for reuse
client.release(true);  // or release(err): close this connection, pool opens a new one later
```

When should you destroy instead of reuse?

- `ROLLBACK` failed: you don't know whether the connection still has an open (aborted) transaction.
- You changed session state you can't easily undo (`SET search_path`, `SET ROLE`, temp tables) and don't want the next borrower to inherit it.
- A query timed out client-side and the server may still be running it.

Destroying a connection costs one reconnect. Reusing a poisoned one can corrupt the next, unrelated request.

## 4. The "aborted transaction" state

```
BEGIN;
INSERT INTO tasks ... ;          -- ok
SELECT 1/0;                      -- ERROR: division by zero
INSERT INTO tasks ... ;          -- ERROR: current transaction is aborted,
                                 --        commands ignored until end of transaction block
ROLLBACK;                        -- the only thing that works now
```

After any error inside a transaction, Postgres refuses everything except `ROLLBACK` (or rolling back to a savepoint). That's why "catch the error and carry on inside the same transaction" doesn't work in Postgres. If you need partial recovery, use a **savepoint**:

```sql
BEGIN;
INSERT INTO orders ...;
SAVEPOINT try_coupon;
INSERT INTO coupon_uses ...;     -- might violate a unique constraint
ROLLBACK TO SAVEPOINT try_coupon; -- undo just that part, transaction is usable again
COMMIT;
```

Libraries that support "nested transactions" (Kysely, Knex, TypeORM) implement them with savepoints.

## 5. Nested `transaction()` calls

In the challenge, `PgTaskRepository.transaction()` on a repository that's *already* bound to a transaction just calls `fn(this)`: the inner work joins the outer transaction. The alternatives:

| Strategy | Behavior | When |
|---|---|---|
| Join outer (what we do) | inner failure aborts everything | simplest, usually what you want |
| Savepoint | inner failure can be rolled back alone | "try this optional step" logic |
| New connection | inner commits independently | almost never; risks deadlocking against yourself |

The third option is a classic self-deadlock: the outer transaction holds a row lock, the inner one (on another connection) waits for that lock, and the outer one is waiting for the inner one to finish. With a small pool you can also deadlock on the *pool* itself: every connection is held by an outer transaction waiting for a second connection.

## 6. Pool sizing, worked example

You run 6 API pods and 2 worker pods. Postgres has 4 vCPUs and `max_connections = 100`.

- Reserve ~10 for superuser, migrations, monitoring and humans → 90 available.
- Peak deploy: old and new pods overlap → plan for 2× pods → 16 processes.
- 90 / 16 ≈ 5 connections per process.

Five feels small, but a request typically holds a connection for 1–5 ms. Five connections can serve ~1,000+ simple queries per second per pod. If requests start queueing for connections, the fix is usually faster queries (module 14) or a pooler like PgBouncer, not a bigger `max`.

Little's law gives the intuition: *connections in use ≈ query rate × average query time*. 500 queries/s × 4 ms = 2 connections busy on average.

## 7. Timeouts you should know

| Setting | Where | Protects against |
|---|---|---|
| `connectionTimeoutMillis` | pg Pool | waiting forever for a free/new connection |
| `idleTimeoutMillis` | pg Pool | holding idle connections forever |
| `statement_timeout` | Postgres (role, connection or `SET LOCAL`) | runaway queries |
| `lock_timeout` | Postgres | waiting forever on a lock (great for migrations!) |
| `idle_in_transaction_session_timeout` | Postgres | leaked open transactions |

You can set Postgres settings per connection from `pg`:

```ts
new pg.Pool({ connectionString, options: "-c statement_timeout=5000 -c lock_timeout=2000" });
```
