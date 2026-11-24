# Hints · Testing Backends

Open one hint at a time. Give each a real try before opening the next.

## Setting up unit tests

<details><summary>Hint 1</summary>

The service's constructor tells you everything it depends on: `repo`, `clock`, `newId`. Each one can be replaced in a test.
</details>

<details><summary>Hint 2</summary>

Write three tiny helpers in `test/helpers/`: a `FakeClock` with `now()`, `set()` and `advance()`; a `sequentialIds()` generator; and a `buildService()` that wires `WalletService` with `new InMemoryWalletRepository()` and those fakes. A factory like `walletWith(service, balanceCents)` saves a lot of repetition.
</details>

<details><summary>Hint 3</summary>

```ts
const clock = new FakeClock("2026-03-19T10:00:00.000Z");
const service = new WalletService({ repo: new InMemoryWalletRepository(), clock, newId: sequentialIds() });
const w = await service.createWallet("Ada");
expect(w).toEqual({ id: "id-1", owner: "Ada", balanceCents: 0, createdAt: "2026-03-19T10:00:00.000Z" });
```
For errors: `await expect(service.withdraw(w.id, 1)).rejects.toMatchObject({ code: "INSUFFICIENT_FUNDS" })`.
</details>

## Which cases to cover

<details><summary>Hint 1</summary>

Go through the spec rule by rule. For each rule with a number in it, test **at** the number, just below, and just above.
</details>

<details><summary>Hint 2</summary>

Things people often miss: withdrawing **exactly** the balance; an amount of `0` passed straight to the service (not through HTTP); checking **both** wallets after a transfer; checking that timestamps equal the fake clock's time; checking the `Location` header and the exact status code of each error.
</details>

## Integration tests with Postgres

<details><summary>Hint 1</summary>

You need a `pg.Pool` pointing at `wl_09`, the schema created, and empty tables at the start of each test. `src/db/migrate.ts` already knows how to create the schema.
</details>

<details><summary>Hint 2</summary>

`beforeAll`: create a pool, `DROP SCHEMA public CASCADE; CREATE SCHEMA public;`, then `migrate(pool)`. `beforeEach`: `TRUNCATE transactions, wallets RESTART IDENTITY CASCADE` and build a fresh app. `afterAll`: `pool.end()`. Keep `fileParallelism: false` (already set).
</details>

<details><summary>Hint 3</summary>

```ts
const walletService = new WalletService({ repo: new PgWalletRepository(pool), clock, newId: sequentialIds("w") });
const app = createApp({ walletService });
const res = await request(app).post("/wallets").send({ owner: "Ada" });
```
Do more than one operation per wallet and look at the numbers you get back, and their types.
</details>

## Bug hunting

<details><summary>Hint 1 (the balance one)</summary>

It only happens with Postgres, never with the in-memory repository. What does the `pg` driver return for a `bigint` column? What does `+` do with that?
</details>

<details><summary>Hint 2 (the balance one)</summary>

Deposit twice into the same wallet through the API, then `GET` it. Compare `typeof res.body.data.balanceCents` and the value with what you expected. Then look at how `pgWalletRepository.ts` maps rows, and compare `toWallet` with `toTransaction`.
</details>

<details><summary>Hint 1 (the limit one)</summary>

The limit is per UTC day. Test what happens across midnight: withdraw the full limit late on one day, then try again just after midnight.
</details>

<details><summary>Hint 2 (the limit one)</summary>

Use the fake clock: `clock.set("2026-03-19T23:59:59.999Z")`, withdraw 100,000, `clock.set("2026-03-20T00:00:00.000Z")`, withdraw again: it should succeed. If it doesn't, print `startOfUtcDay(new Date("2026-03-20T09:00:00Z"))` and read the `Date` methods it uses very carefully.
</details>

## Mutants that survive

<details><summary>Hint 1</summary>

Run `npm run mutants`. Each survivor's description tells you a behavior your tests don't check. Write the test that would fail if that change were made.
</details>

<details><summary>Hint 2</summary>

A survivor on the service usually means a missing unit-test assertion (a boundary, the clock, the other side of a transfer). A survivor on the controller or error handler means an integration test isn't asserting the exact status code or header.
</details>
