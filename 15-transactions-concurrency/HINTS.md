# Hints · Transactions & Concurrency

Open one hint at a time. Give each a real try before opening the next. A good first move for every bug: find the **invariant** the failing test checks, then find every place in `src/` that can change the data behind it.

## Overselling (booking-concurrency: "30 fans racing for 5 seats")

<details><summary>Hint 1</summary>

Look at the order of operations in `BookingService.book`. Where does it decide that there's room, and where does it act on that decision? What can another request do in between?
</details>

<details><summary>Hint 2</summary>

This is check-then-act on a `SUM()` over many rows, which is write skew: each booking inserts a *new* row, so no two transactions ever fight over the same row lock. You need a single row that every booking for a concert has to touch. README §6a and §6b show two ways to get one.
</details>

<details><summary>Hint 3</summary>

Option A (preferred): add a migration with a `tickets_sold` column on `concerts` (backfill it, add a CHECK), then reserve with one statement:
`UPDATE concerts SET tickets_sold = tickets_sold + $2 WHERE id = $1 AND tickets_sold + $2 <= capacity RETURNING …`. 0 rows → not found or sold out.
Option B: `SELECT … FROM concerts WHERE id = $1 FOR UPDATE` before counting. Remember `GET /concerts/:id` must still report `ticketsSold`.
</details>

## Lost updates (wallet-concurrency: "50 concurrent deposits")

<details><summary>Hint 1</summary>

Deposits, bookings and transfers all go through one repository method to change a balance. Read it line by line and ask "where is the new balance computed: in Node or in Postgres?"
</details>

<details><summary>Hint 2</summary>

`SET balance_cents = $2` writes a value computed from a read that may already be stale. The `UPDATE` waits for the other transaction's row lock, but it doesn't recompute anything after waiting.
</details>

<details><summary>Hint 3</summary>

Let the database do the arithmetic and the guard in one statement: `SET balance_cents = balance_cents + $2 WHERE id = $1 AND balance_cents + $2 >= 0 RETURNING balance_cents`. When no row comes back, run a cheap `SELECT 1 … WHERE id = $1` to decide between "not found" and "insufficient funds".
</details>

## Double charges (idempotency: "8 copies of the same request")

<details><summary>Hint 1</summary>

The sequential retry test passes, so the *idea* is implemented. What happens when the second copy arrives while the first one is still inside its transaction?
</details>

<details><summary>Hint 2</summary>

The key lookup, the booking and the key save are three separate steps on (possibly) three different connections. The `ON CONFLICT DO NOTHING` in `save()` quietly hides the fact that you lost the race. What database feature can make the second copy *wait* for the first? (README §7 and §10.)
</details>

<details><summary>Hint 3</summary>

Claim first, inside the booking transaction: `INSERT INTO idempotency_keys (key, request_hash) VALUES … ON CONFLICT (key) DO NOTHING`. `rowCount === 1` → you own the key: book, then `UPDATE idempotency_keys SET response_status, response_body` in the same transaction. `rowCount === 0` → the other copy has committed: `SELECT` its stored response, check the hash, return it with `replayed: true`. Change the repository's methods to support this (e.g. `claim()` and `complete()`).
</details>

## Deadlocks (wallet-concurrency: "transfers A->B and B->A")

<details><summary>Hint 1</summary>

The server log in the failure message says `deadlock detected`. Which two rows does a transfer lock, and in what order? Is that order the same for A→B and B→A?
</details>

<details><summary>Hint 2</summary>

An `UPDATE` takes a row lock and holds it until COMMIT. Draw the timeline from README §8 with your transfer code. The fix is to make every transfer acquire its locks in the same global order.
</details>

<details><summary>Hint 3</summary>

At the top of the transfer transaction: `SELECT id FROM wallets WHERE id = ANY($1::bigint[]) ORDER BY id FOR UPDATE` with both ids. If fewer rows come back than you asked for, one wallet doesn't exist (404). Then debit and credit as before.
</details>

## Pool exhaustion (connection-leaks)

<details><summary>Hint 1</summary>

The failures start after exactly as many errors as the pool has connections. Which service method manages its own connection instead of using the shared helper?
</details>

<details><summary>Hint 2</summary>

Trace what happens to the client from `pool.connect()` when `adjustBalance` throws `NotFoundError`. Does it ever reach `ROLLBACK`? `release()`? What state does Postgres think that session is in?
</details>

<details><summary>Hint 3</summary>

Compare `WalletService.deposit` with `withTransaction` in `src/lib/db.ts`. The helper's `catch` + `finally` is the whole fix.
</details>

## General debugging tips

- Run one file at a time: `npx vitest run test/idempotency.test.ts`.
- The failure messages include what the server logged for unexpected errors, so read them.
- `make psql`, then `SELECT pid, state, pg_blocking_pids(pid), query FROM pg_stat_activity WHERE datname = 'wl_15';` while a test runs.
- Run the whole suite three times after your fixes. A fix that passes 2 out of 3 runs is not a fix.
