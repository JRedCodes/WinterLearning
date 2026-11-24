# Challenge · Tasks API on Postgres

**Type:** 🧩 Scaffold · **Est:** 4–5h · **Services:** Postgres

## Scenario

> **#team-tasks** · *Marcus (staff engineer):* The tasks service has lived on an in-memory repository since the prototype, and every deploy wipes everyone's tasks. 😬 Time to put it on Postgres. The schema's ready in `migrations/`, and the service layer is done and tested. **Please don't touch `TaskService`**: if the repository abstraction is any good, swapping storage shouldn't need it. I wrote a contract test suite that the in-memory repo already passes; your Postgres repo has to pass the same one. Two things I care about: the new "move tasks between projects" feature must be all-or-nothing, and I never want to see a leaked connection again. Last time one took prod down at 3am.

## Your task

Work through the numbered `TODO(n)` comments in `challenge/src/`:

| TODO | File | What |
|---|---|---|
| 1 | `repositories/pgTaskRepository.ts` | `toTask` / `toProject`: map rows to domain objects (types and naming) |
| 2 | `repositories/pgTaskRepository.ts` | Every `TaskRepository` method with parameterized SQL |
| 3 | `db/transaction.ts` | `withTransaction(pool, fn)`: BEGIN/COMMIT/ROLLBACK, always release |
| 4 | `repositories/pgTaskRepository.ts` | `transaction(fn)`: a unit of work using `withTransaction` |
| 5 | `db/migrate.ts` | A migration runner with a `schema_migrations` table |
| 6 | `server.ts` | Composition root: pool → migrate → Pg repository → listen; close server then pool |

Suggested order: 1 → 2 (get the contract suite green except transactions) → 3 → 4 → 5 → 6.

Read these first, they're your spec:

- `src/repositories/taskRepository.ts`: the interface and its documented behavior
- `src/repositories/inMemoryTaskRepository.ts`: a reference implementation that already passes
- `test/contract/taskRepository.contract.ts`: the shared contract suite
- `migrations/*.sql`: the schema you're mapping

## Acceptance criteria

- [ ] `toTask` / `toProject` map snake_case rows to camelCase domain objects: ids stay strings, `numeric` becomes a number, nulls stay null (`pgTaskRepository.test.ts` › row mapping)
- [ ] `PgTaskRepository` passes the full TaskRepository contract suite, the same one `InMemoryTaskRepository` passes (`pgTaskRepository.test.ts`)
  - [ ] `dueDate` round-trips as the same `YYYY-MM-DD` calendar day, even with `TZ=Pacific/Auckland`
  - [ ] unknown project ids raise `ProjectNotFoundError` (translate FK violation `23503`)
  - [ ] `search` is case-insensitive and treats `%` / `_` literally
  - [ ] `updateTask` changes only the given fields, `null` clears, `updatedAt` is bumped
- [ ] Values are always parameters: an injection attempt is stored as plain text
- [ ] `transaction()` uses a real transaction: uncommitted rows are invisible to other connections, failures roll everything back and rethrow the same error
- [ ] Failing transactions don't leak connections (pool of 2, five failures, still works)
- [ ] `withTransaction` (`withTransaction.test.ts`):
  - [ ] BEGIN → fn → COMMIT on the checked-out client, released once
  - [ ] ROLLBACK and rethrow the original error when fn throws
  - [ ] still releases when COMMIT fails
  - [ ] when ROLLBACK fails: rethrow the *original* error and release with a truthy argument (destroy the connection)
- [ ] `TaskService.moveTasks` on Postgres is atomic: a missing task or an injected database failure half-way leaves every task where it was (`moveTasks.test.ts`)
- [ ] `migrate()` (`migrate.test.ts`): applies `NNN_name.sql` files in order, records versions in `schema_migrations`, is idempotent, ignores non-migration files, runs multi-statement files, and rolls back a failing file completely with an error naming it
- [ ] `startServer()` runs migrations, serves from Postgres, and `close()` ends the pool (`server.test.ts`)
- [ ] The HTTP API works end to end on Postgres, including atomic `POST /tasks/move` (`api.test.ts`)
- [ ] Architecture: only `config.ts` reads `process.env`; only `db/`, `repositories/` and `server.ts` touch `pg` (`architecture.test.ts`)
- [ ] `src/services/taskService.ts` is unchanged, and the in-memory tests still pass
- [ ] `npm test` and `npm run typecheck` pass

## Getting started

```bash
cd 13-node-postgres/challenge
make install
make up          # Postgres 16 on localhost:5433 (creates the wl_13 database)
make test        # watch them fail, then make them pass one TODO at a time
```

Once TODO 6 is done, run it for real:

```bash
make dev
curl -s localhost:3000/projects -H 'content-type: application/json' -d '{"name":"Home"}'
curl -s localhost:3000/projects/1/tasks -H 'content-type: application/json' \
  -d '{"title":"Fix the sink","estimateHours":1.5,"dueDate":"2026-12-31"}'
curl -s 'localhost:3000/tasks?projectId=1&search=sink'
curl -s localhost:3000/tasks/move -H 'content-type: application/json' -d '{"taskIds":["1"],"toProjectId":"1"}'
make psql        # then: SELECT * FROM schema_migrations; SELECT * FROM tasks;
```

> ⚠️ The tests use the same `wl_13` database and **wipe it** (`DROP SCHEMA public CASCADE`). Don't keep anything precious there.

Tip: when a mapping test fails, `console.log(result.rows[0])` in your repository once. Seeing what `pg` actually returns beats guessing.

## Rules

- Don't modify the tests or `src/services/taskService.ts`.
- Use `pg` directly. No ORM or query builder in this module (that's the point).
- Every value goes in as a `$n` parameter. The only things you may interpolate into SQL are fixed strings from your own code (column lists, a whitelisted column name).
- Don't call `pool.connect()` outside `withTransaction`.

## Stretch goals

1. **Concurrent migrators.** Start two `migrate()` calls with `Promise.all` on a fresh schema. Do both succeed, with each version recorded once? Use `pg_advisory_xact_lock` to make it safe.
2. **Savepoints.** Make a nested `transaction()` call use `SAVEPOINT` / `ROLLBACK TO SAVEPOINT` so an inner failure can be caught without aborting the outer transaction. Write a test.
3. **Pool metrics.** Add `GET /health/db` returning `{ totalCount, idleCount, waitingCount }` and a `SELECT 1` latency. Keep it in the composition root's wiring, not in a controller importing `pg`.
4. **Statement timeout.** Configure `statement_timeout` through `DB_STATEMENT_TIMEOUT_MS` in `config.ts`, and map Postgres error `57014` to a 503.
5. **Kysely port.** On a separate branch, reimplement `PgTaskRepository` with Kysely. The contract suite tells you when you're done. Compare readability of `listTasks` and `updateTask`.

## Done?

1. `npm test` is green and `npm run typecheck` is clean.
2. Commit on your branch `module/13-node-postgres`, push and open a PR. CI runs this module's tests with a Postgres service.
3. From the repo root: `npm run progress -- 13` to tick it off on the roadmap.
4. Answer the questions in [INTERVIEW.md](INTERVIEW.md).
5. Add an entry to [LOG.md](../LOG.md).
6. Compare with the reference solution: `git diff main origin/solutions -- 13-node-postgres/` (and read `SOLUTION.md` on that branch).

Stuck? → [HINTS.md](HINTS.md)
