# Design review checklist: Postgres-backed services

Use this before opening your PR, and again on every database-backed feature you build after this course. Each item is a question a senior reviewer would ask. If you can't answer one, that's where to look.

## Schema

- [ ] Every table has a primary key. Surrogate (`bigint GENERATED ALWAYS AS IDENTITY`) unless a natural key is genuinely stable and unique (like `(warehouse_id, product_id)`).
- [ ] Every "must never happen" rule that the database *can* enforce is a constraint: `NOT NULL`, `CHECK`, `UNIQUE`, `FOREIGN KEY`.
- [ ] Money is integer cents (`bigint`) or `numeric`, never `real`/`double precision`.
- [ ] Timestamps are `timestamptz`.
- [ ] Case-insensitive uniqueness is handled deliberately (normalize before insert, or a unique index on `lower(col)`).
- [ ] Foreign keys have an explicit `ON DELETE` behavior you chose, and child FK columns are indexed if you delete parents or join on them.
- [ ] Historical facts (price paid, address shipped to) are copied, not joined from mutable tables.

## Migrations

- [ ] Forward-only, numbered, one transaction each.
- [ ] Never edited after being applied anywhere shared.
- [ ] The runner is idempotent and records what it applied.
- [ ] Extensions (`pg_trgm`) are created in a migration.
- [ ] For big tables in production: would this lock the table? (`CREATE INDEX CONCURRENTLY`, add nullable column then backfill in batches.)

## Queries & indexes

- [ ] Every query is parameterized (`$1`), with no string concatenation of values.
- [ ] Each read path has an index whose leading columns match its equality filters and whose trailing columns match its `ORDER BY`.
- [ ] Substring search uses a trigram index, and user wildcards are escaped.
- [ ] Lists are paginated with a keyset cursor and a hard `limit` maximum.
- [ ] No N+1 queries in list endpoints (batch with `= ANY($1)` or a join).
- [ ] Only the columns you need are selected on hot paths.
- [ ] `EXPLAIN (ANALYZE, BUFFERS)` checked on realistic data volumes for anything that will be hot.

## Transactions & concurrency

- [ ] Every multi-statement write that must be all-or-nothing runs in **one** transaction on **one** client.
- [ ] The transaction helper always ROLLBACKs on error and releases in `finally`.
- [ ] No check-then-act: checks are folded into `UPDATE … WHERE`, protected by `FOR UPDATE`, or enforced by a constraint.
- [ ] Rows are locked in a deterministic order (sorted ids) wherever a transaction locks several.
- [ ] State transitions are conditional (`WHERE status = 'reserved'`), so repeating or racing them is harmless.
- [ ] No network calls (HTTP, email, queues) inside a transaction.
- [ ] There's a test that fires concurrent requests and asserts the invariants.

## Error handling

- [ ] Uniqueness is enforced by the database and `23505` is mapped to a domain error in the repository.
- [ ] Foreign key violations that clients can cause are prevented by explicit existence checks (clean 404) or mapped.
- [ ] Domain errors carry a stable machine-readable `code`; the error handler owns the HTTP status mapping.
- [ ] Unexpected errors return a generic 500 and are logged with context.

## Architecture

- [ ] SQL only in repositories; repositories accept a `Queryable` (pool or transaction client).
- [ ] Services own transaction boundaries and business rules, and import neither `express` nor raw SQL.
- [ ] Controllers parse/validate input (zod) and shape responses; no SQL, no `pg`.
- [ ] `config.ts` is the only reader of `process.env`; `server.ts` is the composition root; `app.ts` doesn't listen.
- [ ] The pool has `max` and `connectionTimeoutMillis` set from config, and is closed on shutdown.

## Testing

- [ ] Tests run against real Postgres, with a clean schema per test (or per file).
- [ ] Tests are deterministic. Run the suite three times in a row to check.
- [ ] Concurrency tests use a warmed pool and enough parallel requests to actually overlap.
- [ ] Failure messages say what invariant broke (`expect(x, "stock must never go negative")`).
