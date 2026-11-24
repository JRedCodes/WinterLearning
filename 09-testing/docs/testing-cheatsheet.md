# Testing cheat sheet (Vitest + supertest + Postgres)

## Running

```bash
npx vitest run                    # once
npx vitest                        # watch mode
npx vitest run test/unit          # one folder
npx vitest run -t "daily limit"   # tests whose name matches
npx vitest run --bail=1           # stop at first failure
npx vitest run --reporter=verbose # every test name
```

## Structure

```ts
import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll, vi } from "vitest";

describe("unit", () => {
  beforeEach(() => { /* fresh state */ });
  afterEach(() => vi.restoreAllMocks());
  it("does one thing", async () => { /* arrange, act, assert */ });
  it.each([0, -1, 1.5])("rejects %s", async (x) => { /* ... */ });
  it.todo("handles currency conversion");
  it.skip("temporarily disabled", () => {});
});
```

## Matchers

```ts
expect(x).toBe(3);                         // ===
expect(obj).toEqual({ a: 1 });             // deep equal
expect(obj).toMatchObject({ a: 1 });       // subset
expect(arr).toHaveLength(2);
expect(arr).toContainEqual({ id: "a" });
expect(str).toMatch(/^w-/);
expect(fn).toThrow("message");
await expect(promise).resolves.toEqual(v);
await expect(promise).rejects.toMatchObject({ code: "X" });
expect(value, "custom failure message").toBe(1);
expect.any(String); expect.objectContaining({}); expect.arrayContaining([]);
```

## Spies and mocks

```ts
const fn = vi.fn().mockResolvedValue(42);
expect(fn).toHaveBeenCalledWith("arg");
expect(fn).toHaveBeenCalledTimes(1);
const spy = vi.spyOn(obj, "method").mockImplementation(() => {});
vi.spyOn(repo, "commit").mockRejectedValueOnce(new Error("boom"));
spy.mockRestore();
```

## Time

```ts
// preferred for business rules: injected clock
clock.set("2026-03-19T23:59:59.999Z"); clock.advance(1);

// for code that uses setTimeout/setInterval
vi.useFakeTimers(); vi.advanceTimersByTime(1000); vi.useRealTimers();
vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
```

## supertest

```ts
import request from "supertest";
const res = await request(app).post("/wallets").send({ owner: "Ada" });
res.status; res.body; res.headers.location; res.text;
await request(app).get("/wallets/x").set("X-Request-Id", "t1").expect(404);
await request(app).get("/items").query({ limit: 2 });
await request(app).post("/x").set("Content-Type", "application/json").send('{"bad":');
```

## Postgres in tests

```ts
// vitest.config.ts: globalSetup: ["test/globalSetup.ts"], fileParallelism: false
beforeAll(async () => { pool = new pg.Pool({ connectionString }); await resetSchemaAndMigrate(pool); });
beforeEach(() => pool.query("TRUNCATE transactions, wallets RESTART IDENTITY CASCADE"));
afterAll(() => pool.end());
```

## Test doubles at a glance

| Need | Use |
|---|---|
| Data store in unit tests | fake (in-memory repo) + contract test |
| Control time | fake clock (injected) |
| Predictable ids | sequential id generator |
| Assert a side effect happened | spy |
| Force an error | `mockRejectedValueOnce` / throwing fake / sabotage the DB |

## Checklist for a new endpoint

- [ ] happy path: status, headers, body shape, persisted state
- [ ] validation: each rule, at the boundary (min, max, wrong type)
- [ ] not found / forbidden / conflict paths
- [ ] business-rule boundaries in service unit tests
- [ ] time-dependent behavior with a fake clock
- [ ] error mapping for unexpected failures (generic 500, logged)

## Mutation testing (this module)

```bash
npm test          # your tests + grading (baseline must pass, every mutant must be killed)
npm run test:mine # only your tests (fast loop)
npm run mutants   # detailed mutant report
npm run mutants -- 03   # only mutants whose name contains "03"
```
