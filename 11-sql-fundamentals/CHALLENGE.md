# Challenge · Shopfront Analytics

**Type:** 🛠️ Build · **Est:** 4–5h · **Services:** 🐘 Postgres

## Scenario

> **#data-requests** · *Marta (product analyst):* Hey! Our BI tool is down for the migration and I have a stack of questions from the merch, marketing and support teams. The Shopfront schema is small. I wrote each question up as a comment in `queries/` with the exact columns and ordering I need, because the results get pasted straight into dashboards. Could you write the SQL? The last two are writes for the mobile sync and a price change, so please double-check those. 🙏

## Your task

`challenge/queries/` contains 24 files, `01_*.sql` … `24_*.sql`. Each one starts with a comment describing the question, the exact output columns and the required order. **Write one SQL statement below the comment** in each file.

They get harder as you go:

| # | Topic | # | Topic |
|---|---|---|---|
| 01–03 | `SELECT`, `WHERE`, `NULL`, `ORDER BY`, `LIMIT` | 13 | CTEs (`WITH`) |
| 04 | string functions + `GROUP BY` | 14 | set operations (`EXCEPT`) |
| 05 | `CASE` | 15 | `string_agg`, date ranges |
| 06 | inner join | 16 | NULLs inside aggregates |
| 07 | left join + count | 17 | `row_number()`: top-1 per group |
| 08 | anti-join | 18 | `rank()` with ties |
| 09–10 | aggregates, `HAVING` | 19 | `lag()` |
| 11 | dates (`date_trunc`, `to_char`) | 20 | running totals per partition |
| 12 | correlated subquery | 21–22 | recursive CTEs (tree paths, roll-ups) |
|  |  | 23–24 | `ON CONFLICT` upsert, `UPDATE … RETURNING` |

The schema is in `challenge/sql/schema.sql` (read it, including the comments) and the data in `challenge/sql/seed.sql`. The lesson's ER diagram shows how the tables relate.

## Acceptance criteria

Each criterion is one test in `test/queries.test.ts`, which compares your result with the expected rows in `test/expected/NN_*.json`:

- [ ] Every file contains a query (not just the prompt comment).
- [ ] Column **names and order** match the prompt exactly (use `AS` aliases).
- [ ] Rows match exactly. **Row order matters** wherever the prompt specifies an order (everything except 14, 23 and 24).
- [ ] Numbers are compared by value, so `12.5` and `12.50` are equal, but `52.8333` is not `52.83`: round where the prompt says so.
- [ ] Read exercises (01–22) query the tables. Hard-coded `VALUES` lists are rejected.
- [ ] 23 updates exactly one existing review and inserts exactly one new one, in a single statement.
- [ ] 24 changes the price of exactly the two active Furniture products and nothing else.
- [ ] `npm test` passes (and `npm run typecheck` still passes; you shouldn't need to touch any TypeScript).

## Getting started

```bash
cd 11-sql-fundamentals/challenge
make install
make up          # Postgres 16 on localhost:5433
make test        # 24 failing exercises (plus 2 side-effect checks). Make them pass one by one.
```

Your inner loop:

```bash
npm run q -- 7            # run queries/07_*.sql and print the result as a table
npm run test:watch        # re-runs tests when you save a file
make seed && make psql    # explore interactively: \dt, \d orders, SELECT * FROM orders LIMIT 5;
```

The tests reload the dataset at the start of every run, and the write exercises run inside a transaction that is rolled back, so you can't break anything.

## Rules

- Don't modify `test/`, `sql/` or `src/`.
- One statement per file. Plain SQL only.
- Don't hard-code answers, ids you looked up by hand (exercise 24 says look the category up by name), or the expected rows. The point is a query that would still be right if the data changed.
- Follow each prompt literally: "non-cancelled", "active", "direct category" and "including customers without orders" are all deliberate.

## Stretch goals

1. Rewrite 08 three ways (`NOT EXISTS`, `LEFT JOIN … IS NULL`, `EXCEPT`) and compare `EXPLAIN` output for each.
2. Rewrite 17 with `DISTINCT ON` instead of `row_number()`.
3. Write 19 so that a month with no orders still appears with revenue 0 (hint: `generate_series` + `LEFT JOIN`).
4. Write a query that finds each customer's **favourite category** (most units bought), breaking ties by category name.
5. Write a 3-row "funnel" query: customers → customers with an order → customers with a delivered order, with the percentage at each step.

## Done?

1. `npm test` is green and `npm run typecheck` is clean.
2. Commit on your branch `module/11-sql-fundamentals`, push and open a PR. CI runs this module's tests. Ask Claude to review the PR if you want feedback on query style.
3. From the repo root: `npm run progress -- 11` to tick it off on the roadmap.
4. Answer the questions in [INTERVIEW.md](INTERVIEW.md).
5. Add an entry to [LOG.md](../LOG.md).
6. Compare with the reference solution: `git diff main origin/solutions -- 11-sql-fundamentals/` (and read `SOLUTION.md` on that branch). There's usually more than one correct query.

Stuck? → [HINTS.md](HINTS.md)
