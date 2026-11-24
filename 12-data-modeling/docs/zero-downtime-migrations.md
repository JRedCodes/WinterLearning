# Zero-downtime migrations

On your laptop, a migration is instant and nobody notices. In production, three things change:

1. **Old and new code run at the same time.** During a rolling deploy some instances still run version N while others run N+1, and the migration runs before or during that window.
2. **Tables are big.** Rewriting 200 million rows takes minutes to hours.
3. **Locks queue.** A migration waiting for a lock blocks every query that arrives after it, even ones that would normally not conflict.

## Rule 1: every migration must be compatible with the code currently running

Write down which app versions will see the new schema. If version N will run against the schema *after* this migration, nothing N does may break. That rules out, in a single step:

- dropping or renaming a column or table that N uses
- adding a `NOT NULL` column that N doesn't know to fill
- changing a column's type in a way N's queries don't expect
- tightening a constraint that N's writes violate

## Rule 2: expand, migrate, contract

**Example: rename `users.full_name` → `users.display_name`.**

| Step | Schema | App version | Notes |
|---|---|---|---|
| 1. Expand | add `display_name text` (nullable) | N (unchanged) | instant, compatible |
| 2. Dual write | | N+1 writes both, reads `full_name` | |
| 3. Backfill | `UPDATE … SET display_name = full_name WHERE display_name IS NULL` in batches | N+1 | batches of ~1–10k rows keep locks short |
| 4. Switch reads | | N+2 reads `display_name`, still writes both | |
| 5. Tighten | `SET NOT NULL` (via a `NOT VALID` check first on big tables) | N+2 | |
| 6. Contract | stop writing `full_name`; later drop it | N+3, then migration | |

It's slower, and that's the price of never breaking production. Small teams with tiny tables can merge steps, but they should know which steps they're merging.

## Rule 3: know your locks

Every `ALTER TABLE` takes a lock. Most take `ACCESS EXCLUSIVE`, which conflicts with *everything*, including plain `SELECT`s. The statement itself may be instant, but if it has to wait behind a 5-minute analytics query, every request queues behind it for 5 minutes.

Always set a lock timeout in migrations, and retry later if it fires:

```sql
SET lock_timeout = '3s';
SET statement_timeout = '15min';
```

### Cheat sheet (Postgres 12+)

| Change | Cost | Safe recipe |
|---|---|---|
| `ADD COLUMN` nullable, no default | instant | ✅ |
| `ADD COLUMN … DEFAULT <constant>` | instant (11+) | ✅ volatile defaults like `random()` still rewrite |
| `ADD COLUMN … NOT NULL` on populated table | needs a default | add with default, or nullable → backfill → `SET NOT NULL` |
| `SET NOT NULL` | full scan under exclusive lock | add `CHECK (col IS NOT NULL) NOT VALID`, `VALIDATE CONSTRAINT`, then `SET NOT NULL` (12+ uses the validated check and skips the scan) |
| `ADD FOREIGN KEY` | scans, locks both tables | `ADD CONSTRAINT … NOT VALID`, then `VALIDATE CONSTRAINT` (weaker lock) |
| `ADD CHECK` | scans | same `NOT VALID` → `VALIDATE` dance |
| `CREATE INDEX` | blocks writes for the whole build | `CREATE INDEX CONCURRENTLY` (not in a transaction; check for `INVALID` indexes if it fails) |
| `ADD UNIQUE` constraint | builds an index under lock | `CREATE UNIQUE INDEX CONCURRENTLY`, then `ADD CONSTRAINT … UNIQUE USING INDEX` |
| `ALTER COLUMN TYPE` | usually full rewrite | new column + expand/contract (some changes, like `varchar(n)` → `text`, are free) |
| `DROP COLUMN` | instant, but breaks running code | only after no deployed code references it |
| `RENAME` column/table | instant, but breaks running code | expand/contract, or a view as a temporary alias |

## Rule 4: separate schema changes from data changes

Backfills are data changes, often long-running. Run them as batched jobs (a script or a background job), not inside the migration transaction. A single `UPDATE` of 50 million rows holds row locks for its whole duration and generates a huge amount of WAL.

```sql
-- one batch; repeat until 0 rows updated
UPDATE users SET display_name = full_name
WHERE id IN (
  SELECT id FROM users WHERE display_name IS NULL ORDER BY id LIMIT 5000
);
```

## Rule 5: migrations run once, from one place

- Run migrations as a dedicated deploy step (a CI job or a Kubernetes Job, see modules 26 and 35), not from every app instance at startup.
- If you must run them at startup, take an advisory lock (as this module's runner does) so only one instance migrates.
- Applied migrations are immutable. Fix forward.

## Rollbacks

"Roll back the deploy" is easy for code and hard for schema. Expand/contract is what makes code rollbacks safe: after the expand step, both the old and new code work, so you can roll back the app without touching the database. Destructive steps (contract) come last, after you're confident you won't roll back past them.
