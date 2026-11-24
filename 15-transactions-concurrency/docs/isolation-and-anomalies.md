# Isolation levels & anomalies: a hands-on lab

Reading about isolation levels is one thing; watching them happen is what makes them stick. Open **two psql sessions** side by side (two terminal tabs) against this module's database and run the scripts below step by step. The left column is session 1, the right column session 2. Do each step in the order of the numbers.

```bash
cd 15-transactions-concurrency/challenge
make up && make migrate
make psql     # in two terminals
```

Setup (run once in either session):

```sql
DROP TABLE IF EXISTS lab_accounts, lab_doctors;
CREATE TABLE lab_accounts (id int PRIMARY KEY, balance int NOT NULL);
INSERT INTO lab_accounts VALUES (1, 500), (2, 500);
CREATE TABLE lab_doctors (name text PRIMARY KEY, on_call boolean NOT NULL);
INSERT INTO lab_doctors VALUES ('alice', true), ('bob', true);
```

---

## Lab 1: Read Committed sees new data mid-transaction (non-repeatable read)

| Step | Session 1 | Session 2 |
|---|---|---|
| 1 | `BEGIN;` | |
| 2 | `SELECT balance FROM lab_accounts WHERE id = 1;` → 500 | |
| 3 | | `UPDATE lab_accounts SET balance = 900 WHERE id = 1;` (autocommit) |
| 4 | `SELECT balance FROM lab_accounts WHERE id = 1;` → **900** | |
| 5 | `COMMIT;` | |

Same query, same transaction, different answer. Each statement gets a fresh snapshot at Read Committed. Reset: `UPDATE lab_accounts SET balance = 500;`

## Lab 2: Repeatable Read keeps one snapshot

Repeat Lab 1 but start with `BEGIN ISOLATION LEVEL REPEATABLE READ;`. Step 4 now returns **500**: the snapshot was taken at your first query and doesn't move.

## Lab 3: the lost update (Read Committed)

| Step | Session 1 | Session 2 |
|---|---|---|
| 1 | `BEGIN;` | `BEGIN;` |
| 2 | `SELECT balance FROM lab_accounts WHERE id = 1;` → 500 | |
| 3 | | `SELECT balance FROM lab_accounts WHERE id = 1;` → 500 |
| 4 | `UPDATE lab_accounts SET balance = 600 WHERE id = 1;` (app computed 500+100) | |
| 5 | | `UPDATE lab_accounts SET balance = 600 WHERE id = 1;` → **hangs** (waiting for session 1's row lock) |
| 6 | `COMMIT;` | → returns `UPDATE 1` |
| 7 | | `COMMIT;` |

Final balance: 600. Two +100 deposits, one lost. Now redo it with `SET balance = balance + 100` in steps 4 and 5: the final balance is 700, because session 2's update re-reads the row after waiting.

## Lab 4: Repeatable Read turns the lost update into an error

Same as Lab 3 but both sessions start with `BEGIN ISOLATION LEVEL REPEATABLE READ;`. At step 6, session 2 fails:

```
ERROR:  could not serialize access due to concurrent update
```

SQLSTATE `40001`. The session's transaction is now aborted; `ROLLBACK` and (in an app) retry the whole transaction. Even `SET balance = balance + 100` fails this way at Repeatable Read, because session 2's snapshot is older than the row version it would have to update.

## Lab 5: write skew gets through Repeatable Read

Invariant: at least one doctor on call.

| Step | Session 1 | Session 2 |
|---|---|---|
| 1 | `BEGIN ISOLATION LEVEL REPEATABLE READ;` | `BEGIN ISOLATION LEVEL REPEATABLE READ;` |
| 2 | `SELECT count(*) FROM lab_doctors WHERE on_call;` → 2 | |
| 3 | | `SELECT count(*) FROM lab_doctors WHERE on_call;` → 2 |
| 4 | `UPDATE lab_doctors SET on_call = false WHERE name = 'alice';` | |
| 5 | | `UPDATE lab_doctors SET on_call = false WHERE name = 'bob';` (no wait: different row) |
| 6 | `COMMIT;` | `COMMIT;` |

Both commit. `SELECT * FROM lab_doctors;` shows nobody on call. Reset with `UPDATE lab_doctors SET on_call = true;`

## Lab 6: Serializable catches write skew

Repeat Lab 5 with `BEGIN ISOLATION LEVEL SERIALIZABLE;`. The second `COMMIT` (or sometimes the second UPDATE) fails:

```
ERROR:  could not serialize access due to read/write dependencies among transactions
DETAIL: Reason code: Canceled on identification as a pivot, during commit attempt.
HINT:   The transaction might succeed if retried.
```

The fix at a lower isolation level would be to lock the rows you based the decision on: `SELECT … FROM lab_doctors WHERE on_call FOR UPDATE` in step 2/3. Then session 2 waits at step 3, and when it resumes it sees only one doctor on call.

## Lab 7: a deadlock in slow motion

| Step | Session 1 | Session 2 |
|---|---|---|
| 1 | `BEGIN;` | `BEGIN;` |
| 2 | `UPDATE lab_accounts SET balance = balance - 10 WHERE id = 1;` | |
| 3 | | `UPDATE lab_accounts SET balance = balance - 10 WHERE id = 2;` |
| 4 | `UPDATE lab_accounts SET balance = balance + 10 WHERE id = 2;` → waits | |
| 5 | | `UPDATE lab_accounts SET balance = balance + 10 WHERE id = 1;` → after ~1s: `ERROR: deadlock detected` |

Session 1 continues once session 2 is aborted. While session 1 is waiting in step 4, look at the locks from a third session:

```sql
SELECT pid, locktype, relation::regclass, mode, granted
  FROM pg_locks WHERE relation = 'lab_accounts'::regclass;
SELECT pid, pg_blocking_pids(pid), state, query FROM pg_stat_activity WHERE datname = current_database();
```

`pg_blocking_pids()` is the fastest way to answer "who is blocking whom" during an incident.

## Summary table

| Anomaly | Read Committed | Repeatable Read | Serializable | Fix without changing level |
|---|---|---|---|---|
| Non-repeatable read | happens | prevented | prevented | read once, or `FOR SHARE` |
| Phantom | happens | prevented (PG) | prevented | lock a parent row |
| Lost update | happens with app-side math | error 40001 | error 40001 | `SET x = x + n` or `FOR UPDATE` |
| Write skew | happens | happens | error 40001 | `FOR UPDATE` the rows you read, or a constraint, or materialize the invariant in one row |

## Choosing a level in practice

- **Read Committed + careful SQL** (atomic updates, targeted `FOR UPDATE`, constraints) is what most production Postgres apps run. It's predictable and doesn't need retries for most paths.
- **Serializable** is attractive when invariants span many rows and are hard to protect by hand (complex financial rules). Use a retry wrapper on every transaction, keep transactions short, and mark read-only transactions as `READ ONLY` (they're cheaper under SSI).
- **Repeatable Read** is great for consistent multi-query **reads**: a report or export that must see one point in time.
