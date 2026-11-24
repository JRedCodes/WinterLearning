# Challenge · Concert Tickets & Wallet: race conditions

**Type:** 🐛 Debug · **Est:** 4–5h · **Services:** Postgres

## Scenario

> **#incident-tickets** · *Marco (on-call):* Rough on-sale last night. Summary for whoever picks this up:
>
> 1. **Overselling.** The "Harbor Lights" show has 500 seats and we sold 523 tickets. Support is refunding people by hand.
> 2. **Wallet balances don't add up.** Finance ran the nightly reconciliation (`balance = SUM(ledger)`) and it failed for hundreds of wallets. Some top-ups just... vanished. A few wallets that bought tickets in several tabs at once ended up with more money than they should have.
> 3. **Double charges.** The mobile app retries `POST /bookings` with the same `Idempotency-Key` when a request takes more than 2s. Customers on bad connections got two bookings and were charged twice, even though we "support" idempotency keys.
> 4. **500s on transfers.** When friends split costs, transfers between the same two wallets in both directions sometimes fail with `deadlock detected`.
> 5. **The 3 a.m. outage.** An old mobile build spammed deposits to a deleted wallet. A few minutes later *every* endpoint started failing with `timeout exceeded when trying to connect`, and the DBA saw sessions stuck `idle in transaction`. A restart fixed it.
>
> Everything looks fine in the single-request tests. I think there are **5 separate bugs**. Tests that reproduce each symptom are in `test/`. Good luck! 🎟️

The service is a layered Express app (routes → controllers → services → repositories) on Postgres. Money is stored in integer cents; every balance change is mirrored by an append-only `ledger_entries` row.

## Your task

1. Run the tests and read the failures. The concurrency tests fire 8–50 requests at once with `Promise.all` against a real Postgres and check **invariants** (capacity, total money, ledger = balance, exactly-once).
2. For each symptom, find the root cause. Draw the race as a sequence diagram (on paper is fine) before you fix it: which two requests interleave, and at which statement?
3. Fix all **5 bugs**. You may change any file in `src/` and add new migrations in `migrations/` (e.g. `002_*.sql`). Don't edit `001_init.sql` (it's "already deployed").
4. Write a short note per bug in `challenge/FIXES.md` (symptom → root cause → fix → why the fix is safe). This is what you'd put in the incident postmortem.

## Acceptance criteria

- [ ] **Overselling:** 30 fans racing for 5 seats → exactly 5 bookings (`201`), 25 × `409 SOLD_OUT`. Multi-ticket bookings never exceed capacity. *(booking-concurrency.test.ts)*
- [ ] **Lost updates:** 50 concurrent deposits are all counted; one wallet buying in 10 parallel tabs can never spend more than its balance; `balance = SUM(ledger)` always holds. *(wallet-concurrency, booking-concurrency)*
- [ ] **Idempotency:** 8 identical requests with the same `Idempotency-Key` arriving at once → all get `201` with the **same** booking id, one booking row, one charge. Sequential retries, key reuse with a different body (`422`) and "a failed request doesn't burn the key" still work. *(idempotency.test.ts)*
- [ ] **Deadlocks:** 40 simultaneous transfers A→B and B→A all succeed; a storm of random transfers conserves total money and never goes negative. *(wallet-concurrency.test.ts)*
- [ ] **Connection leaks:** more failed deposits than the pool has connections still each return `404`; afterwards no connection is checked out and no session is `idle in transaction`. *(connection-leaks.test.ts)*
- [ ] All single-request behavior keeps working. *(api.test.ts)*
- [ ] `npm test` and `npm run typecheck` pass. Run the suite **3 times in a row**: concurrency fixes must be deterministic, not lucky.

## Getting started

```bash
cd 15-transactions-concurrency/challenge
make install
make up          # Postgres 16 on localhost:5433
make test        # 9 tests fail
make dev         # optional: run the API (applies migrations on start)
make psql        # poke at the data
```

Reproduce a race by hand (with `make dev` running):

```bash
curl -s localhost:3000/wallets -H 'content-type: application/json' -d '{"owner":"me","initialBalanceCents":0}'
seq 50 | xargs -P 50 -I{} curl -s -o /dev/null localhost:3000/wallets/1/deposits \
  -H 'content-type: application/json' -d '{"amountCents":100}'
curl -s localhost:3000/wallets/1     # expect 5000... do you get it?
```

Useful while debugging: `SELECT pid, state, pg_blocking_pids(pid), query FROM pg_stat_activity WHERE datname = 'wl_15';`

## Rules

- Don't modify the tests or `001_init.sql`.
- No new dependencies, no ORM, no in-process locks (a `Mutex` in Node won't help when you run 3 replicas).
- No `setTimeout` "fixes" or retry-until-it-works loops around racy code. Fix the race.
- Keep the layering: SQL stays in repositories, business rules and transaction boundaries in services.
- Raising the isolation level is allowed, but only with a correct retry strategy, and you must explain it in `FIXES.md`.

## Stretch goals

1. Add a `withSerializableRetry()` helper (see README §9), switch the booking transaction to `SERIALIZABLE` in a branch, and compare: which tests still pass, how many retries happen?
2. Add `GET /admin/reconcile` that returns every wallet where `balance_cents <> SUM(ledger)`.
3. Expire idempotency keys after 24h (a `DELETE` you could run from a cron job) and add an index that makes it cheap.
4. Configure `idle_in_transaction_session_timeout` and `lock_timeout` for the app's connections (hint: the `options` connection parameter or `SET` on connect) and write a test proving a stuck transaction gets killed.
5. Seat maps: replace general admission with numbered seats (`seats(concert_id, seat_no, booking_id)`) and let 10 workers claim seats with `FOR UPDATE SKIP LOCKED`.

## Done?

1. `npm test` is green (three runs in a row) and `npm run typecheck` is clean.
2. Commit on your branch `module/15-transactions-concurrency`, push and open a PR. CI runs this module's tests.
3. From the repo root: `npm run progress -- 15` to tick it off on the roadmap.
4. Answer the questions in [INTERVIEW.md](INTERVIEW.md).
5. Add an entry to [LOG.md](../LOG.md): which bug took longest to find, and why?
6. Compare with the reference solution: `git diff main origin/solutions -- 15-transactions-concurrency/` (and read `SOLUTION.md` on that branch).

Stuck? → [HINTS.md](HINTS.md)
