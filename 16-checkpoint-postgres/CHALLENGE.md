# Challenge · Inventory & Orders API

**Type:** 🛠️ Build (from scratch) · **Est:** 6–8h · **Services:** Postgres

## Scenario

> **#team-commerce** · *Dana (engineering manager):* We're replacing the inventory spreadsheet our warehouse team has been fighting with. MVP scope: a catalog with stock per warehouse, orders that reserve stock, and cancellations that put it back. Marketing is planning a limited drop next month, so **overselling is not an option**: if 3,000 people try to buy 200 units, exactly 200 orders go through. The frontend wants cursor pagination for order history (they got burned by duplicate rows with page numbers before), and product search has to stay fast once the catalog hits six figures.
>
> The acceptance tests are in `challenge/test/` and they're the contract. How you structure the inside is up to you, as long as the architecture tests pass. No ORM please; we want to see the SQL.

## What's provided

```
challenge/
  package.json, tsconfig.json, vitest.config.ts, Makefile, docker-compose.yml, .env.example
  src/compose.ts        ← stub: buildApp({ pool }) the tests call
  src/db/migrate.ts     ← stub: migrate(pool) the tests call
  migrations/           ← empty: your SQL goes here
  test/                 ← acceptance + architecture tests (don't edit)
```

Everything else you write.

## Your task

Build the API below with a layered architecture on Express 5, `pg` and zod.

### Required entry points (what the tests import)

| File | Export | Contract |
|---|---|---|
| `src/db/migrate.ts` | `migrate(pool): Promise<string[]>` | Applies pending `migrations/*.sql` in name order, each in a transaction, recording them in `schema_migrations`. Returns names applied by this call (`[]` when up to date). |
| `src/compose.ts` | `buildApp({ pool }): Express` | Wires repositories → services → `createApp(...)` and returns the app without listening. |
| `src/app.ts` | `createApp(...)` | Builds the Express app. Must not call `listen()`. |
| `src/server.ts` | | Composition root: loads config, creates the pool, calls `buildApp`, listens, closes the pool on SIGINT/SIGTERM. |
| `src/config.ts` | | The **only** file that reads `process.env` (zod-validated, safe defaults; `DATABASE_URL` defaults to `postgres://postgres:postgres@localhost:5433/wl_16`). |

Also add a `src/db/runMigrations.ts` so `npm run migrate` works.

### Required schema names (the tests query these directly)

- Tables: `products`, `warehouses`, `stock_levels`, `orders`, `order_lines`, `schema_migrations`
- `products (id, sku, name, description, price_cents, …)`, `warehouses (id, code, name, …)`
- `stock_levels (warehouse_id, product_id, available)` with **`available` never negative (CHECK)**
- `orders (id, customer_id, status, created_at, …)` with `status` in `'reserved' | 'cancelled'`
- `order_lines (order_id, product_id, quantity, …)`
- A **GIN trigram index** (`gin_trgm_ops`) on `products(name)`
- An index on `orders` starting with `(customer_id, created_at …)`

### API

All responses are JSON. Success bodies are `{ "data": … }`. Errors are `{ "error": { "code", "message", "details"? } }`. IDs are numbers; money is integer cents; timestamps are ISO strings.

#### Health
`GET /health` → `200 { "status": "ok" }`

#### Products
| Method & path | Body / query | Success | Errors |
|---|---|---|---|
| `POST /products` | `{ sku, name, description?, priceCents }` | `201` + `Location: /products/:id`, `data: Product` | `400 VALIDATION_ERROR`, `409 DUPLICATE_SKU` |
| `GET /products/:id` | | `200 data: Product & { totalAvailable, stock: [{ warehouseId, available }] }` (stock sorted by warehouseId) | `400` bad id, `404 NOT_FOUND` |
| `GET /products` | `?q=&limit=` | `200 data: Product[]` | `400` |

- `Product = { id, sku, name, description (string or null), priceCents, createdAt }`
- `sku`: trimmed, 3–32 chars of letters/digits/dashes, **stored upper-case**, unique (so `mug-1` conflicts with `MUG-1`).
- `name`: trimmed, 1–200 chars. `priceCents`: integer ≥ 0.
- Search: `q` (optional) matches products whose name **contains** `q`, case-insensitively. `%` and `_` in `q` match literally. Results are ordered by name. `limit` is 1–100, default 20. Without `q`, list all products by name.

#### Warehouses & stock
| Method & path | Body | Success | Errors |
|---|---|---|---|
| `POST /warehouses` | `{ code, name }` | `201 data: { id, code, name, createdAt }` | `400`, `409 DUPLICATE_WAREHOUSE` |
| `PUT /warehouses/:warehouseId/stock/:productId` | `{ available }` (integer ≥ 0) | `200 data: { warehouseId, productId, available }` | `400`, `404 NOT_FOUND` (warehouse or product) |

`PUT` **sets** the quantity (it doesn't add to it). It creates the stock row if it doesn't exist.

#### Orders
| Method & path | Body / query | Success | Errors |
|---|---|---|---|
| `POST /orders` | `{ customerId, warehouseId, lines: [{ productId, quantity }] }` | `201` + `Location`, `data: Order` | `400`, `404 NOT_FOUND`, `409 INSUFFICIENT_STOCK` |
| `GET /orders/:id` | | `200 data: Order` | `404` |
| `POST /orders/:id/cancel` | | `200 data: Order` (status `cancelled`) | `404`, `409 ORDER_NOT_CANCELLABLE` |
| `GET /orders` | `?customerId=&status=&limit=&cursor=` | `200 { data: OrderSummary[], nextCursor: string or null }` | `400` |

- `OrderSummary = { id, customerId, warehouseId, status, totalCents, createdAt }`
- `Order = OrderSummary & { lines: [{ productId, quantity, unitPriceCents }] }`
- **Placing** an order reserves `quantity` units of every line from the given warehouse, **all or nothing**. Prices come from the catalog at order time and are stored on the lines (later price changes don't affect the order). `totalCents = Σ quantity × unitPriceCents`.
  - `lines`: 1–50 entries, each product at most once, quantity ≥ 1 → else `400`.
  - Unknown warehouse or product → `404`.
  - Any line without enough stock (including no stock row at all) → `409 INSUFFICIENT_STOCK` with `details: [{ productId }]` for the line that failed, and **nothing** is reserved.
- **Cancelling** a `reserved` order sets status `cancelled` and puts all its units back. Cancelling an already cancelled order → `409 ORDER_NOT_CANCELLABLE` and no stock change.
- **Listing**: newest first (`created_at DESC, id DESC`), optional filters `customerId` and `status` (`reserved | cancelled`, anything else `400`), `limit` 1–100 (default 20). Keyset pagination: `nextCursor` is an opaque string to pass as `cursor` for the next page, `null` on the last page. An invalid cursor → `400`. List items have no `lines`.

#### Other errors
- Malformed JSON → `400 INVALID_JSON`. Unknown route → `404 ROUTE_NOT_FOUND`. Anything unexpected → `500 INTERNAL_ERROR` with a generic message (log the details).

### Concurrency requirements (tested)

- 30 concurrent single-unit orders for a product with 10 in stock → exactly 10 succeed, 20 get `409`, stock ends at 0.
- 24 concurrent two-line orders, half listing `[A, B]` and half `[B, A]`, with 10 of each in stock → exactly 10 succeed, the rest `409`, **no 500s**.
- 10 concurrent cancels of one order → exactly one `200`, nine `409`, stock released once.
- Mixed concurrent orders and cancels → `available + reserved units` stays equal to the initial stock.

## Acceptance criteria

- [ ] **Migrations** (`migrations.test.ts`): tables exist, runner records and is idempotent, stock CHECK, trigram index, customer/created_at index.
- [ ] **Catalog** (`catalog.test.ts`): products, SKU normalization and uniqueness, validation, warehouses, stock upsert, product detail with stock, search (case-insensitive, literal wildcards, ordering, limits), INVALID_JSON, ROUTE_NOT_FOUND.
- [ ] **Orders** (`orders.test.ts`): place, all-or-nothing, missing stock row, 404s, validation, cancel, double cancel, price frozen at order time.
- [ ] **Listing** (`orders-list.test.ts`): full walk without gaps or duplicates, default limit, summaries without lines, stability under inserts, filters, bad params.
- [ ] **Concurrency** (`concurrency.test.ts`): the four scenarios above.
- [ ] **Architecture** (`architecture.test.ts`): layered folders; no `express` in services/repositories/domain; no `pg` in domain; no SQL or `pg` in routes/controllers; `process.env` only in `config.ts`; `app.ts` doesn't listen, `server.ts` does.
- [ ] `npm test` passes 3 runs in a row; `npm run typecheck` is clean.

## Getting started

```bash
cd 16-checkpoint-postgres/challenge
make install
make up          # Postgres 16 on localhost:5433
make test        # everything fails: you're starting from zero
```

Suggested order (README §9): migrations → skeleton + architecture → catalog → orders → concurrency → listing. Run one file at a time while you work: `npx vitest run test/migrations.test.ts`.

When the API runs (`make migrate && make dev`):

```bash
curl -s localhost:3000/warehouses -H 'content-type: application/json' -d '{"code":"BER-1","name":"Berlin"}'
curl -s localhost:3000/products -H 'content-type: application/json' -d '{"sku":"lamp-1","name":"Desk Lamp","priceCents":2999}'
curl -s -X PUT localhost:3000/warehouses/1/stock/1 -H 'content-type: application/json' -d '{"available":3}'
curl -s localhost:3000/orders -H 'content-type: application/json' \
  -d '{"customerId":"me","warehouseId":1,"lines":[{"productId":1,"quantity":2}]}'
curl -s 'localhost:3000/orders?customerId=me&limit=1'
```

## Rules

- Don't modify `test/`.
- No ORM or query builder: raw SQL with `pg` and parameterized queries. (Allowed deps are already in `package.json`.)
- No in-process locks or retry loops to paper over races: the database guarantees correctness.
- Migrations are plain `.sql` files; never edit one after it has been applied, add a new one.

## Stretch goals

1. **Reservation expiry**: orders not confirmed within 15 minutes release their stock (a `POST /orders/:id/confirm`, an `expires_at` column, and a job that cancels expired orders safely using `FOR UPDATE SKIP LOCKED`).
2. **On hand vs reserved**: split `available` into `on_hand` and `reserved`, add a `ship` transition, and make `PUT` stock refuse to set `on_hand` below `reserved`.
3. **Multi-warehouse allocation**: if `warehouseId` is omitted, fulfil each line from the warehouse with the most stock (or split it), still all-or-nothing and deadlock-free.
4. **Idempotency keys** on `POST /orders` (module 15 pattern).
5. Seed 200k products with `generate_series` and compare `EXPLAIN ANALYZE` for search with and without the trigram index. Put the numbers in your PR.
6. A `GET /products/:id/stock-history` backed by an append-only stock movements table.

## Done?

1. `npm test` is green (three runs in a row) and `npm run typecheck` is clean.
2. Commit on your branch `module/16-checkpoint-postgres`, push and open a PR. In the description, explain your schema, your lock ordering and your pagination cursor. CI runs this module's tests.
3. From the repo root: `npm run progress -- 16` to tick off Phase 2. 🎉
4. Answer the questions in [INTERVIEW.md](INTERVIEW.md).
5. Add an entry to [LOG.md](../LOG.md): what would you design differently if you started again?
6. Compare with the reference solution: `git diff main origin/solutions -- 16-checkpoint-postgres/` (and read `SOLUTION.md` on that branch).

Stuck? → [HINTS.md](HINTS.md)
