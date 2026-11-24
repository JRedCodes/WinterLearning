# Hints · Postgres from Node

Open one hint at a time. Give each a real try before opening the next.

## TODO 1: Row mapping

<details><summary>Hint 1</summary>

Look at the comment above `TaskRow`: which columns arrive as strings even though they hold numbers? Which ones need to stay strings?
</details>

<details><summary>Hint 2</summary>

`estimate_hours` is `string | null`. Map `null` to `null`, anything else through `Number()`. Ids (`bigint`) stay as strings. For `due_date`, decide where formatting happens: in SQL (recommended) or in JS. If it's already a `"YYYY-MM-DD"` string, pass it through.
</details>

<details><summary>Hint 3</summary>

Define one column list and reuse it in every query returning tasks:

```ts
const TASK_COLUMNS = `id, project_id, title, status, estimate_hours,
  to_char(due_date, 'YYYY-MM-DD') AS due_date, created_at, updated_at`;
```

`status` is a plain `string` in the row; the CHECK constraint guarantees it's a valid `TaskStatus`, so a cast there is acceptable.
</details>

## TODO 2: Repository methods

<details><summary>Hint 1</summary>

Every query is `this.db.query<RowType>(sql, params)` (use `this.db`, not `this.pool`, so the same code works inside transactions). `INSERT ... RETURNING <columns>` and `UPDATE ... RETURNING <columns>` give you the stored row without a second query.
</details>

<details><summary>Hint 2</summary>

- **Defaults on insert:** `COALESCE($3, 'todo')` lets you pass `null` for an absent status.
- **FK violation:** catch the error, check `err.code === "23503"` (and ideally `err.constraint === "tasks_project_id_fkey"`), throw `new ProjectNotFoundError(...)`, otherwise rethrow.
- **delete:** `rowCount` tells you whether a row was deleted.
- **search:** `ILIKE` with a pattern you build in JS: `%${escaped}%`, where `escaped` has `\`, `%`, `_` prefixed with a backslash, then add `ESCAPE '\'` in SQL. (Or `strpos(lower(title), lower($n)) > 0`.)
</details>

<details><summary>Hint 3</summary>

Dynamic SQL without injection: push values into an array and generate placeholders from its length.

```ts
const where: string[] = [];
const params: unknown[] = [];
const p = (v: unknown) => { params.push(v); return `$${params.length}`; };
if (filter.status !== undefined) where.push(`status = ${p(filter.status)}`);
// ...
const sql = `SELECT ${TASK_COLUMNS} FROM tasks ${where.length ? "WHERE " + where.join(" AND ") : ""}
             ORDER BY created_at, id LIMIT ${p(filter.limit ?? 50)}`;
```

For `updateTask`, loop over a fixed `{ projectId: "project_id", title: "title", ... }` map, skip `undefined` values (but not `null`!), and always add `updated_at = now()`.
</details>

## TODO 3: `withTransaction`

<details><summary>Hint 1</summary>

All statements must use the client from `pool.connect()`. Think about every path: fn resolves, fn throws, COMMIT throws, ROLLBACK throws. In which of them must `release()` be called? (All of them, exactly once.)
</details>

<details><summary>Hint 2</summary>

`try { BEGIN; fn; COMMIT; return } catch { ROLLBACK; throw } finally { release }` covers most of it. The tricky case: if `ROLLBACK` throws inside `catch`, that new error replaces the original one. Wrap ROLLBACK in its own `try/catch`.
</details>

<details><summary>Hint 3</summary>

Keep a variable like `let broken: Error | undefined` outside the `try`. Set it if ROLLBACK fails, `throw err` (the original) from the outer `catch`, and in `finally` call `client.release(broken)`. `release(undefined)` is a normal release; `release(error)` destroys the connection.
</details>

## TODO 4: `transaction()`

<details><summary>Hint 1</summary>

The service calls `repo.transaction(async (tx) => ...)` and uses `tx` for everything. What should `tx` be so that its queries go through the transaction's client?
</details>

<details><summary>Hint 2</summary>

The constructor already takes `(pool, db = pool)`. Inside `withTransaction(this.pool, (client) => ...)`, build `new PgTaskRepository(this.pool, client)` and pass it to `fn`.
</details>

<details><summary>Hint 3</summary>

```ts
if (this.db !== this.pool) return fn(this); // already in a transaction: join it
return withTransaction(this.pool, (client) => fn(new PgTaskRepository(this.pool, client)));
```
</details>

## TODO 5: `migrate()`

<details><summary>Hint 1</summary>

You need `readdir` and `readFile` from `node:fs/promises` and `join` from `node:path`. Filter with the regex from the TODO comment, then `.sort()`.
</details>

<details><summary>Hint 2</summary>

Create `schema_migrations` with `CREATE TABLE IF NOT EXISTS` first. Then, for each file, inside **one** `withTransaction`: check whether the version is recorded, and if not, run the file's SQL and insert the version. Return `true`/`false` from the callback so you know whether it ran.
</details>

<details><summary>Hint 3</summary>

Wrap each file's transaction in `try/catch` and rethrow with context: `throw new Error(\`Migration ${file} failed: ${err.message}\`, { cause: err })`. Because the SQL and the `INSERT` share one transaction, a failure undoes both. Stop the loop on the first failure (rethrowing does that).
</details>

## TODO 6: `startServer()`

<details><summary>Hint 1</summary>

Order on the way up: pool, migrate, repository, service, app, listen. Order on the way down: HTTP server, then pool.
</details>

<details><summary>Hint 2</summary>

Wrap the startup in `try/catch`: if `migrate` (or `listen`) throws, `await pool.end()` before rethrowing. In `close()`, use `try { await closeHttp() } finally { await pool.end() }` so the pool is closed even if closing the server fails.
</details>

<details><summary>Hint 3</summary>

The test checks `pg_stat_activity` for connections whose `application_name` is the one in the config. `createPool(config)` already sets it. If the test says connections remain, your `close()` isn't calling `pool.end()`, or it's ending a different pool than the one the repository uses.
</details>
