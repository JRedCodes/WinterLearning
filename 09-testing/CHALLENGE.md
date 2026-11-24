# Challenge · Wallet service: write the tests

**Type:** 🛠️ Build (tests) · **Est:** 4–5h · **Services:** Postgres

## Scenario

> **#payments-squad** · *Jonas (EM):* The wallet service goes to the first pilot customers next week, and it has **zero** tests. The previous contractor swore it "works on their machine". I want a proper suite before we take real money: unit tests for the rules, integration tests through the API against a real Postgres.
>
> *Leila (QA):* Two things from my manual testing. I can't pin them down, so I'm not filing tickets yet: a pilot user said their **balance looked crazy** after a couple of deposits, and someone's **daily withdrawal limit** seemed to block them on a day they hadn't withdrawn anything. Your tests will probably find them.
>
> *Jonas:* We'll grade the suite with mutation testing, so tests that execute code without checking anything won't cut it. 😉

**The code has 2 real bugs.** Write tests that expose them, then fix the bugs in `src/`.

## The system under test

A layered Express + Postgres app (you know the shape from module 06):

```
src/
  app.ts                          createApp({ walletService }): no listen()
  server.ts                       composition root (pg pool, migrations, listen)
  controllers/walletsController.ts  HTTP + zod validation
  routes/wallets.ts
  middleware/errorHandler.ts      domain errors → HTTP
  services/walletService.ts       business rules; injected repo, clock, id generator
  domain/                         types, errors, limits
  repositories/
    walletRepository.ts           interface
    inMemoryWalletRepository.ts   fake for unit tests
    pgWalletRepository.ts         real implementation (pg)
  db/                             migrate(), ensureDatabase()
migrations/001_wallets.sql
```

### Specification

**Wallets** have an `id`, an `owner`, a `balanceCents` (integer, never negative) and a `createdAt`. All money is integer cents.

| Method & path | Body | Success | Errors |
|---|---|---|---|
| `POST /wallets` | `{ owner }` (1–100 chars, trimmed) | `201` + `Location: /wallets/:id`, `{ data: wallet }` with balance 0 | `400 VALIDATION_ERROR` |
| `GET /wallets/:id` | | `200 { data: wallet }` | `404 WALLET_NOT_FOUND` |
| `POST /wallets/:id/deposits` | `{ amountCents }` | `200 { data: wallet }` | `400`, `404` |
| `POST /wallets/:id/withdrawals` | `{ amountCents }` | `200 { data: wallet }` | `400`, `404`, `422 INSUFFICIENT_FUNDS`, `422 DAILY_LIMIT_EXCEEDED` |
| `POST /transfers` | `{ fromWalletId, toWalletId, amountCents }` | `200 { data: { from, to } }` | `400`, `404`, `422 INSUFFICIENT_FUNDS`, `422 SAME_WALLET_TRANSFER` |
| `GET /wallets/:id/transactions?limit=` | | `200 { data: Transaction[] }`, newest first; `limit` 1–100, default 20 | `400`, `404` |

Business rules (enforced in `WalletService`, independent of HTTP):

- Amounts must be positive integers, otherwise `INVALID_AMOUNT` (the HTTP layer's validation usually rejects these first, but the service must protect itself too: jobs and scripts call it directly).
- You may withdraw your **entire** balance, but never go below zero.
- **Daily withdrawal limit:** at most **100,000 cents** of withdrawals per **UTC calendar day** (from 00:00:00.000Z). The withdrawal that would exceed the limit is rejected. Transfers and deposits don't count.
- A transfer debits the sender and credits the recipient atomically, and records a `transfer_out` and a `transfer_in` transaction. Transferring to the same wallet is rejected.
- Every wallet and transaction gets its timestamp from the **injected clock** and its id from the injected `newId`.
- Error bodies look like `{ error: { code, message, details? } }`; malformed JSON → `400 INVALID_JSON`; unknown routes → `404 ROUTE_NOT_FOUND`; unexpected errors → `500 INTERNAL_ERROR` with a generic message.

## Your task

1. **Write unit tests** for `WalletService` using `InMemoryWalletRepository`, a fake clock and predictable ids (write those small helpers yourself in `test/helpers/`).
2. **Write integration tests** for the HTTP API with supertest against `createApp(...)` wired to `PgWalletRepository` and a **real Postgres** (`wl_09`). Reset the database state between tests. `test/globalSetup.ts` already creates the database.
3. **Find the 2 bugs** with your tests, then **fix them** in `src/` (small changes, no rewrites).
4. Delete `test/placeholder.test.ts`.
5. Get `npm test` green: it runs your tests **and** the grading test `test/meta.test.ts`.

### How grading works

`test/meta.test.ts` (and `npm run mutants`, which prints a detailed report) copies the project to a temp folder and:

1. runs your tests against the real `src/`: they must **pass**;
2. for each of the **8 mutants** in `mutants/`, swaps one `src` file for a slightly broken copy and runs your tests again: they must **fail** ("kill" the mutant).

Six mutants are realistic mistakes someone could make in the service, controller or error handler. Two are the original files containing the real bugs: they're killed only once your tests expose the bugs. A surviving mutant means some behavior has no test checking it.

> 🙈 Try not to read `mutants/` before writing your tests. Write tests from the spec above, then use the report to find gaps. That's how mutation testing is used at work.

## Acceptance criteria

- [ ] Your tests pass on the (fixed) code in `src/`.
- [ ] All 8 mutants are killed (`npm run mutants` shows `8/8`).
- [ ] Both real bugs are fixed in `src/`, each with a test that fails without the fix.
- [ ] The suite has unit tests (service + fakes, no HTTP, no DB) **and** integration tests (HTTP + real Postgres).
- [ ] Tests are deterministic: no dependency on the real current time, random ids or test order.
- [ ] `npm test` is green and `npm run typecheck` is clean.

## Getting started

```bash
cd 09-testing/challenge
make install
make up              # Postgres on localhost:5433
make test            # placeholder passes, every mutant survives → red
npm run test:mine    # just your tests (fast loop while writing)
npm run mutants      # detailed mutant report
```

Suggested order: service unit tests (happy paths, then every rule at its boundaries), then API integration tests (each endpoint: success, validation, errors), then run the mutants and close the gaps.

## Rules

- Don't modify `test/meta.test.ts`, `test/globalSetup.ts`, `scripts/` or `mutants/`.
- In `src/`, only change what's needed to fix the 2 bugs. (Mutants are full copies of `src` files, so other edits would be overwritten during grading anyway.)
- Use the real Postgres in integration tests: don't mock `pg`.
- No new dependencies.

## Stretch goals

1. Write a **contract test**: one suite run against both `InMemoryWalletRepository` and `PgWalletRepository`.
2. Prove that a transfer is **atomic**: make the second half fail inside Postgres and assert nothing changed.
3. Add a 9th mutant of your own (a mistake you think is likely) and make sure your suite kills it.
4. Install `@vitest/coverage-v8` and look at the coverage report. Find a line that's covered but whose mutation would survive.
5. Two concurrent withdrawals could both pass the balance check (a lost update). Write a test that demonstrates it against Postgres; the fix comes in [module 15](../15-transactions-concurrency/README.md).

## Done?

1. `npm test` is green and `npm run typecheck` is clean.
2. Commit on your branch `module/09-testing`, push and open a PR. CI runs this module's tests (with a Postgres service). Ask Claude to review the PR if you want feedback.
3. From the repo root: `npm run progress -- 09` to tick it off on the roadmap.
4. Answer the questions in [INTERVIEW.md](INTERVIEW.md).
5. Add an entry to [LOG.md](../LOG.md): which test found which bug?
6. Compare with the reference solution: `git diff main origin/solutions -- 09-testing/` (and read `SOLUTION.md` on that branch).

Stuck? → [HINTS.md](HINTS.md)
