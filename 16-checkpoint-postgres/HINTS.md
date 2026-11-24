# Hints · Checkpoint: Postgres

This is a checkpoint, so try hard before opening these. Each group goes from a nudge to nearly the answer.

## Migrations and the runner

<details><summary>Hint 1</summary>

You need: read the directory, sort file names, find out which are already applied, and apply the rest one by one. Where do you remember "already applied"?
</details>

<details><summary>Hint 2</summary>

`CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`. Each file: `pool.connect()`, `BEGIN`, run the file's SQL (a multi-statement string works with `client.query` when there are no parameters), insert its name, `COMMIT`. On error, `ROLLBACK` and throw with the file name in the message.
</details>

<details><summary>Hint 3</summary>

Resolve the directory relative to the module file, not the current working directory: `path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../migrations")`. Put `CREATE EXTENSION IF NOT EXISTS pg_trgm;` at the top of your first migration.
</details>

## Getting the architecture tests green

<details><summary>Hint 1</summary>

Read `test/architecture.test.ts`. It scans folders and file contents: it needs `src/domain`, `src/services`, `src/repositories` and `src/routes` or `src/controllers` to contain `.ts` files.
</details>

<details><summary>Hint 2</summary>

Reuse the shape from module 15: `createApp({ services, logger })` in `app.ts`, a `buildServices(pool)` that instantiates repositories and services, and `buildApp({ pool })` in `compose.ts` that combines them. `server.ts` calls `loadConfig()`, creates the pool and calls `buildApp`.
</details>

## Duplicate SKUs / warehouse codes

<details><summary>Hint 1</summary>

Don't `SELECT` first. What does Postgres do when you insert a duplicate into a unique index?
</details>

<details><summary>Hint 2</summary>

It throws an error with `code === "23505"` (and `constraint` set to the index name). Catch it in the repository and throw your domain error. Normalize the SKU to upper case in the service before inserting.
</details>

## Search

<details><summary>Hint 1</summary>

`ILIKE` gives case-insensitive matching. What does `%` mean inside a LIKE pattern, and what happens if the user types one?
</details>

<details><summary>Hint 2</summary>

Escape user input: `q.replace(/[\\%_]/g, (c) => "\\" + c)`, then pass `%${escaped}%` as a parameter. Backslash is Postgres's default LIKE escape character.
</details>

<details><summary>Hint 3</summary>

One query handles both cases: `WHERE $1::text IS NULL OR name ILIKE $1 ORDER BY name, id LIMIT $2`. Index: `CREATE INDEX … ON products USING gin (name gin_trgm_ops);`
</details>

## Placing orders (all or nothing, no overselling)

<details><summary>Hint 1</summary>

Which statements must succeed or fail together? They all have to run on one client inside one transaction.
</details>

<details><summary>Hint 2</summary>

For each line, one statement both checks and reserves: `UPDATE stock_levels SET available = available - $3 WHERE warehouse_id = $1 AND product_id = $2 AND available >= $3`. `rowCount === 0` means not enough (or no row). Throw, and let your transaction helper roll back everything reserved so far.
</details>

<details><summary>Hint 3</summary>

The deadlock test sends lines in opposite orders. Sort lines by `productId` before reserving. Load all products with one `WHERE id = ANY($1::bigint[])` query to get prices and detect unknown ids. Insert the lines in one statement with `unnest`, or a loop is fine too.
</details>

## Cancelling exactly once

<details><summary>Hint 1</summary>

Ten cancels arrive at once. If each one reads the status, then decides, what goes wrong?
</details>

<details><summary>Hint 2</summary>

Make the transition itself conditional: `UPDATE orders SET status = 'cancelled' WHERE id = $1 AND status = 'reserved' RETURNING …`. Only one request gets a row back. Zero rows → look up the order to choose between 404 and 409. Release stock (sorted by product id) only if you got the row.
</details>

## Keyset pagination

<details><summary>Hint 1</summary>

Read [docs/keyset-pagination.md](docs/keyset-pagination.md). The position after the last row is `(created_at, id)` of that row.
</details>

<details><summary>Hint 2</summary>

`WHERE ($3::timestamptz IS NULL OR (created_at, id) < ($3, $4)) ORDER BY created_at DESC, id DESC LIMIT limit + 1`. If you get `limit + 1` rows, there's a next page.
</details>

<details><summary>Hint 3</summary>

If pages skip rows when orders are created quickly, your cursor lost microseconds by going through a JS `Date`. Select the timestamp as text for the cursor: `to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`. Encode `[createdAt, id]` as base64url JSON, and decode defensively (anything odd → 400).
</details>

## General

- Remember `bigint` columns come back as strings. Convert them in the repository's row mapper.
- Tests reset the schema before every test by dropping `public` and calling your `migrate()`, so a broken migration fails everything. Fix migrations first.
- `make psql` and `\d+ orders` show your table, constraints and indexes.
