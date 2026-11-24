# 13 · Postgres from Node

> In module 12 you designed a schema. Now your app has to talk to it, and nearly every production incident involving a database starts here: a leaked connection, a string-concatenated query, a transaction that wasn't really a transaction, or a `numeric` that quietly became the string `"19.90"`.

**Time:** ~7h · **Challenge:** 🧩 Scaffold · **Prereqs:** [06 · Layered Architecture](../06-layered-architecture/README.md), [11 · SQL Fundamentals](../11-sql-fundamentals/README.md), [12 · Data Modeling](../12-data-modeling/README.md) · **Services:** Postgres

## What you'll learn

- How `pg` (node-postgres) talks to Postgres, and the difference between a **Client** and a **Pool**
- What a connection costs, how pools work, and how to size one
- **Parameterized queries**, and why they make SQL injection structurally impossible
- How Postgres types turn into JavaScript values, and the three that bite: `bigint`, `numeric`, `date`
- Implementing the **repository pattern** against a real database, behind an interface the service already uses
- **Transactions** from Node: a `withTransaction` helper that never leaks a connection
- The **unit of work** idea: making several repository calls atomic without leaking SQL into the service
- **Migrations**: how a runner works, and running them at startup vs as a deploy step
- Query builders (Kysely) vs ORMs (Prisma, Drizzle, TypeORM): the trade-offs
- Testing against a real database with **contract tests**

---

## 1. How Node talks to Postgres

Postgres is a separate server process. Your app opens a **TCP connection** to it (port 5432 by default; 5433 in this repo), authenticates, and then sends SQL over Postgres's own wire protocol. Each connection is served by a dedicated **backend process** on the database server.

```mermaid
sequenceDiagram
  participant App as Node app (pg)
  participant PG as Postgres server
  App->>PG: TCP connect + TLS (optional)
  App->>PG: StartupMessage (user, database, application_name)
  PG-->>App: auth challenge (SCRAM)
  App->>PG: password proof
  PG-->>App: AuthenticationOk, ReadyForQuery
  Note over PG: a backend process now exists just for this connection
  App->>PG: Parse/Bind/Execute "SELECT ... WHERE id = $1" ["42"]
  PG-->>App: RowDescription, DataRow..., CommandComplete
```

Two things follow from that picture:

1. **Opening a connection is expensive.** It takes several network round trips, password hashing, and the server forks a process that uses a few MB of RAM. Doing it per HTTP request would add milliseconds of latency and could exhaust the server.
2. **A connection runs one query at a time.** It's a conversation, not a multiplexed pipe. If you send two queries on the same connection, the second waits.

The `pg` package is the standard Node driver (Kysely, Drizzle, and many other tools use it underneath). It gives you two main objects.

### `Client`: one connection

```ts
import pg from "pg";

const client = new pg.Client({ connectionString: "postgres://postgres:postgres@localhost:5433/wl_13" });
await client.connect();
const { rows } = await client.query("SELECT now() AS now");
await client.end();
```

Good for scripts and one-off tools. In a server, a single `Client` would be a bottleneck (one query at a time for all users) and a single point of failure (if it drops, everything fails).

### `Pool`: a set of reusable connections

```ts
const pool = new pg.Pool({ connectionString, max: 10 });

// Checks out an idle connection (or opens one), runs the query, and puts it back.
const { rows } = await pool.query("SELECT * FROM tasks WHERE id = $1", [id]);
```

```mermaid
flowchart LR
  subgraph Node process
    R1[request A] --> P
    R2[request B] --> P
    R3[request C] --> P
    P{{Pool max=3}}
  end
  P --- C1[(conn 1)]
  P --- C2[(conn 2)]
  P --- C3[(conn 3)]
  C1 --> PG[(Postgres)]
  C2 --> PG
  C3 --> PG
  R4[request D] -. waits in queue .-> P
```

When every connection is busy, the next caller **waits in a queue** until one is released (or until `connectionTimeoutMillis` passes, and then it gets an error). That queue is why a leaked connection is so dangerous: leak `max` of them and every later request waits forever.

**Rule:** create **one pool per process**, in your composition root, and pass it down. Never create a pool per request or per repository.

### `pool.connect()`: borrowing a connection yourself

```ts
const client = await pool.connect(); // a PoolClient
try {
  await client.query("...");
  await client.query("...");          // guaranteed to be the SAME connection
} finally {
  client.release();                   // ALWAYS give it back
}
```

You need this when several statements must run on the same connection. The main case is transactions (section 6). `pool.query()` is just shorthand for connect, query, release.

## 2. Pool sizing and lifecycle

The options that matter:

| Option | What it does | Typical value |
|---|---|---|
| `max` | Upper bound on open connections from this process | 10 (the default) |
| `connectionTimeoutMillis` | How long to wait for a free connection before erroring | 2–5 s (the default `0` means wait forever, which is a bad default) |
| `idleTimeoutMillis` | Close connections idle this long | 10–30 s |
| `application_name` | Shows up in `pg_stat_activity`, so you can tell which app owns which connection | your service name |

**How big should `max` be?** Smaller than you think. Postgres performance usually peaks with a number of *active* connections around a small multiple of its CPU cores. Beyond that, the extra connections just contend for locks, CPU and memory. And your budget is shared:

```
total connections = instances × pool max  (+ migrations, cron jobs, your psql session…)
```

Postgres's default `max_connections` is 100. Ten app instances with `max: 20` is 200, and the database starts refusing logins during a deploy, when old and new instances overlap. At scale, teams put **PgBouncer** (a connection pooler that sits in front of Postgres) or a managed equivalent between apps and the database.

**Lifecycle in a server:**

```mermaid
flowchart LR
  A[start] --> B[create pool] --> C[run migrations] --> D[build app] --> E[listen]
  E --> F[SIGTERM] --> G[server.close: stop accepting, drain in-flight] --> H[pool.end] --> I[exit]
```

Order matters on the way down: close the HTTP server first so in-flight requests can finish *using* the database, then `pool.end()`. If you end the pool first, those requests fail with "Cannot use a pool after calling end on the pool".

**Don't forget the `error` listener:**

```ts
pool.on("error", (err) => logger.error({ err }, "idle pg client error"));
```

If the database restarts or a network blip kills an idle connection, the pool emits `error`. An `EventEmitter` with no `error` listener **crashes the process**. One line prevents that.

## 3. Parameterized queries (and SQL injection)

Here's the bug that has leaked more data than any other:

```ts
// ❌ NEVER
await pool.query(`SELECT * FROM users WHERE email = '${email}'`);
```

If `email` is `' OR '1'='1`, the query becomes `... WHERE email = '' OR '1'='1'` and returns every user. With `'; DROP TABLE users; --` it gets worse.

The fix isn't escaping. It's **not mixing data into code at all**:

```ts
// ✅ ALWAYS
await pool.query("SELECT * FROM users WHERE email = $1", [email]);
```

With placeholders, `pg` uses the **extended query protocol**: the SQL text (with `$1`) is sent in one message and the values in another. Postgres parses and plans the SQL *before* it ever sees the values, so a value can never change the query's structure. `' OR '1'='1` is just a weird email address that matches nobody.

What can't be a parameter? **Identifiers and keywords**: table names, column names, `ASC`/`DESC`. If you need those to vary (sorting by a user-chosen column, a dynamic `UPDATE ... SET`), pick them from a **whitelist in your code**, never from input:

```ts
const SORT_COLUMNS = { created: "created_at", title: "title" } as const;
const column = SORT_COLUMNS[req.query.sort as keyof typeof SORT_COLUMNS] ?? "created_at";
await pool.query(`SELECT ... ORDER BY ${column} LIMIT $1`, [limit]); // column comes from OUR map
```

> 💡 `LIKE`/`ILIKE` patterns are a subtler case. `title ILIKE '%' || $1 || '%'` is injection-safe, but `%` and `_` inside the user's text still act as wildcards: searching `50%` also matches `500`. Escape them (`\%`, `\_`) and add `ESCAPE '\'`, or use `strpos(lower(title), lower($1)) > 0`. The challenge's contract tests check this.

A bonus: Postgres can reuse the parsed statement, and the values are sent in a typed binary-safe way, so you never think about quoting dates or strings again.

## 4. From rows to domain objects

`pool.query()` resolves to a `QueryResult` with `rows` (array of plain objects keyed by column name), `rowCount`, and `fields`. Two kinds of mapping are your job.

### Types: what pg gives you

`pg` converts each column using the column's type:

| Postgres type | JS value | Why / gotcha |
|---|---|---|
| `int`, `smallint`, `real`, `double precision` | `number` | safe |
| `bigint` (`int8`, incl. identity/serial8 ids) | **`string`** | can exceed `Number.MAX_SAFE_INTEGER` (2⁵³−1) |
| `numeric` / `decimal` | **`string`** | exact decimals; JS floats aren't (`0.1 + 0.2`) |
| `boolean` | `boolean` | |
| `text`, `varchar`, `uuid` | `string` | |
| `timestamptz` | `Date` | correct instant |
| `timestamp` (without tz) | `Date` | interpreted in the **Node process's** local zone, which is a common source of bugs |
| `date` | **`Date` at local midnight** | a calendar day isn't an instant (see below) |
| `json` / `jsonb` | parsed object | |
| arrays (`text[]`) | JS arrays | |
| `count(*)` | **`string`** | it's a `bigint`; cast with `count(*)::int` if it's small |

The `date` trap: `due_date = '2026-12-31'` arrives as `new Date(2026, 11, 31)` *in the server's local time zone*. Call `toISOString()` and in Auckland (UTC+13) you get `2026-12-30T11:00:00.000Z`, the **previous day**. It works on your laptop in UTC and breaks for a colleague in Sydney. The cleanest fix is to let Postgres format it: `to_char(due_date, 'YYYY-MM-DD') AS due_date`. The challenge runs its tests with `TZ=Pacific/Auckland` to catch exactly this.

Options for the others:

- **Map in the repository** (what we do): `Number(row.estimate_hours)`, keep ids as strings. Explicit, local, testable.
- **Global type parsers**: `pg.types.setTypeParser(20, BigInt)`. That's global mutable state affecting every query in the process (and every library using `pg`). Use sparingly.
- **Cast in SQL**: `count(*)::int`, `to_char(...)`. Great for one-off columns.

Money? Keep `numeric` in the database. In JS either keep the string, use integer cents, or use a decimal library. Don't round-trip prices through floats.

### Shape: snake_case → camelCase

The database speaks `project_id`, your domain speaks `projectId`. Do the translation in **one function per entity**, inside the repository:

```ts
interface TaskRow { id: string; project_id: string; estimate_hours: string | null; /* ... */ }

function toTask(row: TaskRow): Task {
  return {
    id: row.id,
    projectId: row.project_id,
    estimateHours: row.estimate_hours === null ? null : Number(row.estimate_hours),
    // ...
  };
}
```

Then use **one column list** for every query that returns that entity, so `SELECT`, `INSERT ... RETURNING` and `UPDATE ... RETURNING` always produce the same shape:

```ts
const TASK_COLUMNS = `id, project_id, title, status, estimate_hours,
  to_char(due_date, 'YYYY-MM-DD') AS due_date, created_at, updated_at`;
```

Why not `SELECT *`? The row shape silently changes when someone adds a column, you may pull large columns you don't need (module 14), and you can't apply per-column formatting.

> ⚠️ `pool.query<TaskRow>(...)` is **not validation**. The generic just tells TypeScript what to assume. If your SQL selects different columns, TypeScript won't notice. That's why repository tests run against a real database.

## 5. The repository pattern, for real this time

In module 06 you put data access behind an interface. Until now the implementation was a `Map`. Here's the payoff: you add a Postgres implementation, change one line in the composition root, and the service layer doesn't change.

```mermaid
flowchart TB
  C[Controller] --> S[TaskService]
  S --> I[[TaskRepository interface]]
  I -. implemented by .-> M[InMemoryTaskRepository]
  I -. implemented by .-> P[PgTaskRepository]
  P --> Q[Queryable: Pool or PoolClient]
  Q --> DB[(Postgres)]
  R[server.ts composition root] -->|new PgTaskRepository pool| S
```

Rules that keep this honest:

- **Domain types in, domain types out.** No `pg` types, rows, or snake_case past the repository.
- **Translate driver errors into domain errors** for *expected* cases. Postgres reports a foreign key violation as error code `23503` with the constraint name; the repository turns that into `ProjectNotFoundError`. Unexpected errors (connection refused) propagate unchanged and become a 500.
- **Return `null` for "not found"**, and let the service decide whether that's an error. That's a business decision, not a data-access one.

Useful Postgres error codes (SQLSTATE):

| Code | Name | Typical mapping |
|---|---|---|
| `23505` | unique_violation | `EmailTakenError` → 409 |
| `23503` | foreign_key_violation | `XNotFoundError` → 404/422 |
| `23514` | check_violation | validation gap → 400/422 |
| `23502` | not_null_violation | usually a bug |
| `40001` | serialization_failure | retry ([module 15](../15-transactions-concurrency/README.md)) |
| `40P01` | deadlock_detected | retry ([module 15](../15-transactions-concurrency/README.md)) |

### Contract tests

How do you know the in-memory and Postgres repositories really behave the same? Write the tests **once**, against the interface, and run them for each implementation:

```ts
export function describeTaskRepositoryContract(name: string, makeRepo: () => Promise<TaskRepository>) {
  describe(name, () => {
    it("treats % literally in search", async () => { /* ... */ });
  });
}
describeTaskRepositoryContract("InMemory", async () => new InMemoryTaskRepository());
describeTaskRepositoryContract("Pg", async () => { await truncate(); return new PgTaskRepository(pool); });
```

If they diverge, your fast service unit tests (in memory) would be lying about production (Postgres). The contract suite is what makes the in-memory fake trustworthy.

## 6. Transactions from Node

A transaction groups statements so they all happen or none do. In SQL it's `BEGIN; ...; COMMIT;` (or `ROLLBACK`). In Node, there's one rule everything else follows from:

> **Every statement in a transaction must run on the same connection.**

Transaction state lives on the connection (the backend process), not in your code. This is the most common bug:

```ts
// ❌ Looks like a transaction. Isn't one.
await pool.query("BEGIN");                  // connection #1
await pool.query("UPDATE accounts ...");    // maybe connection #2, autocommitted!
await pool.query("COMMIT");                 // maybe connection #3
```

Each `pool.query` may borrow a different connection. Worse, connection #1 is now returned to the pool **with an open transaction**, and the next request that gets it runs inside your half-finished transaction.

The fix is to borrow one client and pass it around. Since you'll do this everywhere, wrap it once:

```ts
export async function withTransaction<T>(pool: Pool, fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
```

```mermaid
flowchart TD
  A[pool.connect] --> B[BEGIN]
  B --> C[fn client]
  C -- resolves --> D[COMMIT]
  C -- throws --> E[ROLLBACK]
  D -- throws --> E
  D --> F[return result]
  E --> G[rethrow original error]
  F --> H[finally: release]
  G --> H
```

This sketch is close, but production code needs two refinements, which the challenge makes you handle:

1. **What if `ROLLBACK` itself fails?** (The connection died mid-transaction.) If it throws inside `catch`, it *replaces* the original error, and you lose the real cause. Catch it separately and always rethrow the original.
2. **Don't reuse a broken connection.** `client.release(err)` (passing a truthy value) tells the pool to destroy that connection instead of handing it to the next request.

Also note what happens when a statement fails inside a transaction: Postgres marks the transaction **aborted**, and every later statement fails with `current transaction is aborted, commands ignored until end of transaction block` until you `ROLLBACK`. Release a client in that state without rolling back and the next borrower inherits the mess.

### Unit of work: transactions without leaking SQL into services

The service wants "move these three tasks atomically". It shouldn't know about `BEGIN` or `PoolClient`. The pattern: the repository offers a `transaction(fn)` method that hands `fn` **another repository bound to the transaction's client**:

```ts
// service: pure business logic, still no SQL
return this.repo.transaction(async (tx) => {
  const target = await tx.findProjectById(toProjectId);
  if (!target) throw new ProjectNotFoundError(toProjectId);
  for (const id of ids) {
    const task = await tx.updateTask(id, { projectId: toProjectId });
    if (!task) throw new TaskNotFoundError(id); // → ROLLBACK, earlier moves undone
  }
});

// Pg repository: same class, different Queryable
transaction<T>(fn: (tx: TaskRepository) => Promise<T>) {
  return withTransaction(this.pool, (client) => fn(new PgTaskRepository(this.pool, client)));
}
```

That's why the repository depends on a tiny `Queryable` interface (anything with `query()`): a `Pool` outside transactions, a `PoolClient` inside. Same SQL, same mapping, different connection.

This is a simple form of the **unit of work** pattern: a boundary around a set of changes that commit or roll back together. Bigger systems often have a `UnitOfWork` object exposing several repositories (`uow.run(({ tasks, projects }) => ...)`). Same idea, more repositories.

> Keep transactions **short**. While one is open, it holds a pooled connection and row locks. Never `await fetch(...)` to another service inside a transaction: a slow third party now holds your database locks. Concurrency, isolation levels and locking are [module 15](../15-transactions-concurrency/README.md).

## 7. Migrations

Your schema changes over time, and every environment (your laptop, CI, staging, production) must end up with the same schema in the same order. A **migration** is a versioned, ordered script that moves the schema one step forward. You met the concept in [module 12](../12-data-modeling/README.md); now you'll build the runner.

A runner is surprisingly small:

```mermaid
flowchart TD
  A[read migrations dir] --> B[filter NNN_name.sql, sort]
  B --> C[CREATE TABLE IF NOT EXISTS schema_migrations]
  C --> D{for each file}
  D --> E{version already in schema_migrations?}
  E -- yes --> D
  E -- no --> F[BEGIN; run file; INSERT version; COMMIT]
  F -- error --> G[ROLLBACK; stop with error naming the file]
  F --> D
```

Key properties:

- **Ordered and immutable.** Once a migration has run anywhere shared, never edit it. Write a new one.
- **Tracked.** The `schema_migrations` table is the source of truth for what ran.
- **Transactional.** Postgres supports transactional DDL (`CREATE TABLE`, `ALTER TABLE`... roll back cleanly), which many databases don't. Running each file plus its bookkeeping `INSERT` in one transaction means a failed migration leaves no half-applied state. (Exception: a few statements like `CREATE INDEX CONCURRENTLY` refuse to run inside a transaction; real tools let you opt a file out.)
- **Safe under concurrency.** Two instances booting at once must not both apply `003`. A Postgres **advisory lock** (`pg_advisory_xact_lock(key)`) serializes them.

### At startup, or as a separate step?

| | Run at app startup | Separate deploy step (`npm run migrate`) |
|---|---|---|
| Simplicity | ✅ nothing extra to run | needs a pipeline step / job |
| Many instances | needs a lock (they all try) | runs once |
| Long migrations | block startup; health checks may kill the pod | run before rollout, observable |
| Permissions | app user needs DDL rights | app can run with a least-privilege user |
| Typical use | small apps, dev, this challenge | most production teams |

The challenge does both: the server migrates at boot, and `npm run migrate` runs it standalone. You'll wire the separate step into a pipeline in [module 26](../26-docker-ci-deploy/README.md). Whichever you choose, write **backward-compatible** migrations (expand, then contract), because old app instances keep running against the new schema during a rolling deploy.

Real-world tools: node-pg-migrate, Kysely's migrator, Drizzle Kit, Prisma Migrate, Flyway, Liquibase, Atlas. They add down-migrations, checksums, and non-transactional opt-outs, but the core is what you'll write.

## 8. Raw SQL vs query builders vs ORMs

You'll write raw SQL with `pg` in this module because you can't judge abstractions until you know what they generate. Here's the landscape you'll meet at work:

| | Raw SQL (`pg`) | Query builder (Kysely, Knex) | ORM (Prisma, Drizzle, TypeORM, MikroORM) |
|---|---|---|---|
| You write | SQL strings | SQL-shaped TypeScript | models + method calls |
| Type safety | manual row types | inferred from schema types | generated or inferred |
| Dynamic queries | string building (careful!) | composable, safe | good for common cases |
| Complex SQL (CTEs, windows, `FOR UPDATE SKIP LOCKED`) | anything | most things | escape hatch to raw SQL |
| Performance visibility | exactly what you wrote | close to what you wrote | can hide N+1s and heavy queries |
| Learning curve | SQL | SQL + API | API + its abstractions |

```ts
// Kysely: still SQL, but typed and composable
const tasks = await db
  .selectFrom("tasks")
  .select(["id", "title", "status"])
  .where("project_id", "=", projectId)
  .orderBy("created_at")
  .limit(50)
  .execute(); // type: { id: string; title: string; status: string }[]
```

A reasonable default for a backend team that knows SQL: **a query builder for most queries, raw SQL for the hard ones, and repositories around both.** ORMs shine for CRUD-heavy apps and fast prototyping; their costs show up in performance work (module 14) and in unusual queries. Whatever you choose, the repository interface means the rest of your app doesn't care. More in [docs/orms-and-query-builders.md](docs/orms-and-query-builders.md).

## 9. Testing with a real database

Mocks of `pool.query` test that you *called* a function with a string. They can't tell you the SQL is valid, that the column exists, or that `numeric` comes back as a string. For repositories, **test against real Postgres**:

- A dedicated database per module/test run (`wl_13`), created by a Vitest **globalSetup** if missing.
- Reset state between tests: `TRUNCATE ... RESTART IDENTITY CASCADE` is fast; `DROP SCHEMA public CASCADE` is thorough.
- Run test files **serially** (`fileParallelism: false`) when they share a database, or give each worker its own schema.
- Use **fakes where they help**: `withTransaction`'s edge cases (what if `ROLLBACK` fails?) are easier to provoke with a fake client than with a real server.
- Contract tests let fast in-memory service tests and slow real-database tests reinforce each other.

The challenge's tests use all of these. Read them; they're part of the lesson.

## Common mistakes

- `BEGIN` / `COMMIT` with `pool.query()`: each may run on a different connection.
- Forgetting `client.release()` on an error path. The pool slowly drains, then the app hangs.
- Concatenating values into SQL, or putting user input into identifiers without a whitelist.
- Treating `bigint` ids and `count(*)` results as numbers (`"10" + 1 === "101"`).
- `numeric` money converted to float and back.
- `date` columns converted with `toISOString()`: off by one day east of UTC.
- `SELECT *` in repositories, so the row shape drifts as the schema evolves.
- Creating a `Pool` per request, or per repository instance.
- No `pool.on("error")` listener: a database restart crashes the process.
- Ending the pool before the HTTP server has drained.
- Editing a migration that already ran in a shared environment.
- Holding a transaction open across slow I/O (HTTP calls, user think time).

## In production

- **Connection budgets** are a real capacity constraint. Teams track `instances × pool max` against `max_connections`, and use PgBouncer (in transaction mode) or managed proxies like RDS Proxy. Note that transaction-mode poolers break session features like session-level advisory locks and `SET` without `LOCAL`.
- **Statement timeouts**: set `statement_timeout` (per role, per connection, or `SET LOCAL` per transaction) so one runaway query can't hold a connection forever. `idle_in_transaction_session_timeout` kills connections that leaked an open transaction.
- **Observability**: `application_name` plus `pg_stat_activity` tells you who holds connections and what they're running. Export pool metrics (`totalCount`, `idleCount`, `waitingCount`). A rising `waitingCount` is often the first sign of trouble ([module 24](../24-observability/README.md)).
- **Read replicas**: larger systems send reads to replicas and writes to the primary, which means two pools and awareness of replication lag.
- **Migrations in CI/CD**: run against a production-like copy first, review lock impact (`ALTER TABLE` can take heavy locks), and prefer expand/contract over breaking changes.

## Check yourself

1. Why is `await pool.query("BEGIN")` followed by more `pool.query` calls not a transaction?
   <details><summary>Answer</summary>Transaction state lives on one connection. Each <code>pool.query</code> may borrow a different connection, so the later statements autocommit elsewhere, and the connection that ran <code>BEGIN</code> goes back to the pool with an open transaction. Use <code>pool.connect()</code> and run every statement on that client.</details>
2. A column is `bigint`. What type does `pg` return, and why?
   <details><summary>Answer</summary>A string, because int8 values can exceed <code>Number.MAX_SAFE_INTEGER</code> (2⁵³−1) and would silently lose precision as JS numbers.</details>
3. How do parameterized queries prevent SQL injection, and what can't be parameterized?
   <details><summary>Answer</summary>The SQL text and the values are sent separately; Postgres parses and plans the statement before binding values, so a value can never change the query structure. Identifiers (table/column names) and keywords like <code>ASC</code> can't be parameters, so take them from a whitelist in code.</details>
4. In what order should a server shut down its HTTP server and its pool, and why?
   <details><summary>Answer</summary>HTTP server first (stop accepting, let in-flight requests finish, since they may need the database), then <code>pool.end()</code>.</details>
5. Why should a migration and its `schema_migrations` insert run in the same transaction?
   <details><summary>Answer</summary>So they succeed or fail together: a failed migration leaves no partial schema changes and isn't recorded, and a successful one can't end up applied but unrecorded (which would make the next run apply it again).</details>

## Further reading

- node-postgres docs: https://node-postgres.com/ (see the Pooling, Transactions and Queries pages)
- PostgreSQL error codes (SQLSTATE): https://www.postgresql.org/docs/current/errcodes-appendix.html
- PostgreSQL transactions tutorial: https://www.postgresql.org/docs/current/tutorial-transactions.html
- PostgreSQL `pg_stat_activity`: https://www.postgresql.org/docs/current/monitoring-stats.html
- Kysely: https://kysely.dev/
- Deep dives in this module: [docs/pools-and-transactions.md](docs/pools-and-transactions.md) · [docs/orms-and-query-builders.md](docs/orms-and-query-builders.md) · [docs/node-postgres-cheatsheet.md](docs/node-postgres-cheatsheet.md)
- Repo cheat sheet: [../docs/cheatsheets/sql.md](../docs/cheatsheets/sql.md)

## ➡️ Next: [the challenge](CHALLENGE.md)
