# node-postgres (`pg`) cheat sheet

```ts
import pg from "pg"; // ESM: default import, then pg.Pool / pg.Client / pg.types
```

## Pool

```ts
const pool = new pg.Pool({
  connectionString: "postgres://user:pass@host:5433/db",
  max: 10,                        // max open connections
  connectionTimeoutMillis: 5_000, // fail instead of waiting forever
  idleTimeoutMillis: 30_000,
  application_name: "my-api",     // visible in pg_stat_activity
  // ssl: { rejectUnauthorized: true },     // managed databases
  // options: "-c statement_timeout=5000",  // per-connection settings
});
pool.on("error", (err) => console.error("idle client error", err)); // don't crash

await pool.query("SELECT 1");
pool.totalCount; pool.idleCount; pool.waitingCount; // metrics
await pool.end(); // on shutdown, after the HTTP server closed
```

## Queries

```ts
const r = await pool.query<{ id: string; title: string }>(
  "SELECT id, title FROM tasks WHERE project_id = $1 AND status = $2",
  [projectId, "todo"],
);
r.rows;      // [{ id: "1", title: "..." }]
r.rowCount;  // rows returned / affected (number | null)
r.fields;    // column metadata (name, dataTypeID)

// INSERT ... RETURNING gives you the stored row (defaults, ids)
const { rows: [task] } = await pool.query(
  "INSERT INTO tasks (project_id, title) VALUES ($1, $2) RETURNING *", [pid, title]);

// Affected rows
const { rowCount } = await pool.query("DELETE FROM tasks WHERE id = $1", [id]);

// Arrays as parameters
await pool.query("SELECT * FROM tasks WHERE id = ANY($1::bigint[])", [["1", "2", "3"]]);

// Several statements: only without parameters (simple protocol)
await pool.query("CREATE TABLE a (id int); CREATE TABLE b (id int);");
```

Same `$1` can appear twice: `WHERE a = $1 OR b = $1`. Placeholders are positional and 1-based.

## Transactions

```ts
const client = await pool.connect();
let broken: Error | undefined;
try {
  await client.query("BEGIN");                 // or BEGIN ISOLATION LEVEL SERIALIZABLE
  await client.query("UPDATE ...", [...]);
  await client.query("COMMIT");
} catch (err) {
  try { await client.query("ROLLBACK"); } catch (e) { broken = e as Error; }
  throw err;
} finally {
  client.release(broken); // truthy → destroy the connection
}
```

`SET LOCAL statement_timeout = '2s'` inside a transaction applies only to that transaction.

## Type mapping

| Postgres | JS | Tip |
|---|---|---|
| int2/int4/float | number | |
| int8 / bigint / `count(*)` | string | `count(*)::int` when small |
| numeric | string | `Number()` for non-money; keep string/cents for money |
| timestamptz | Date | |
| timestamp | Date (local tz!) | prefer timestamptz |
| date | Date (local midnight!) | `to_char(d, 'YYYY-MM-DD')` or `d::text` |
| json/jsonb | object | writing: objects are serialized for you, but JS arrays become Postgres arrays, so `JSON.stringify` arrays bound for jsonb |
| bool | boolean | |
| `text[]` | string[] | |

Global override (affects the whole process):

```ts
pg.types.setTypeParser(pg.types.builtins.INT8, (v) => BigInt(v));
pg.types.setTypeParser(pg.types.builtins.DATE, (v) => v); // keep 'YYYY-MM-DD'
```

## Errors

```ts
try { ... } catch (err) {
  const e = err as pg.DatabaseError;
  e.code;       // SQLSTATE, e.g. "23505"
  e.constraint; // "users_email_key"
  e.detail;     // "Key (email)=(a@b.c) already exists."
  e.table; e.column;
}
```

| Code | Meaning |
|---|---|
| 23505 | unique_violation |
| 23503 | foreign_key_violation |
| 23514 | check_violation |
| 23502 | not_null_violation |
| 22P02 | invalid_text_representation (e.g. `'abc'::bigint`) |
| 40001 | serialization_failure (retry) |
| 40P01 | deadlock_detected (retry) |
| 57014 | query_canceled (statement_timeout) |

## Handy SQL for Node devs

```sql
SELECT pid, application_name, state, left(query, 80) FROM pg_stat_activity WHERE datname = current_database();
SELECT pg_terminate_backend(pid);                   -- kill a stuck connection
SELECT * FROM schema_migrations ORDER BY version;   -- what ran?
SELECT pg_advisory_xact_lock(42);                   -- transaction-scoped mutex
```
