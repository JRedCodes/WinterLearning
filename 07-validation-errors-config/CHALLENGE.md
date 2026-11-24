# Challenge · Harden the Product Catalog API

**Type:** 🧩 Scaffold · **Est:** 3–4h · **Services:** none

## Scenario

> **#catalog-team** · *Dana (backend lead):* The catalog API is layered and wired up, but it's held together with tape. Last week:
> - the storefront sent `"priceCents": "1999"` and we stored a string,
> - `?inStock=false` returned only in-stock products,
> - someone over-reserved a mug and stock went to **-3**,
> - every error is a 500 that leaks internals ("ECONNREFUSED db-primary-7"), so the mobile team can't tell a typo from an outage,
> - and prod booted without an API key because nobody noticed `API_KEY` was missing.
>
> The skeleton is all there. Can you fill in the TODOs? The frontend wants field-level errors so they can highlight form inputs. 🙏

## Your task

Work through the numbered `TODO(n)` comments in `challenge/src/`. Each has a matching test file.

| TODO | File | What | Tests |
|---|---|---|---|
| 1 | `config.ts` | zod env schema, per-env defaults, cross-field rules, aggregated `ConfigError` | `config.test.ts` |
| 2 | `schemas/product.ts` | zod schemas for bodies, params and the list query (coercion, transforms, refinements) | `schemas.test.ts` |
| 3 | `middleware/validate.ts` | `validate({ body, query, params })` factory with a `details` array | `validate.test.ts` |
| 4 | `domain/errors.ts` | `ProductNotFoundError`, `DuplicateSkuError`, `InsufficientStockError` in the right categories | `errors.test.ts` |
| 5 | `services/productService.ts` | throw those domain errors from the service | `productService.test.ts` |
| 6 | `middleware/errorHandler.ts` | map error categories to 400/401/404/409/422, bad JSON, logged generic 500 | `errorHandler.test.ts` |

`products.test.ts` exercises everything together through HTTP. The detailed specs are in the TODO comments.

Suggested order: **4 → 5 → 6 → 2 → 3 → 1.** Errors first means every later step produces proper responses as soon as it works.

## Acceptance criteria

- [ ] `loadConfig(env)` returns a typed `Config` with defaults (log level depends on `NODE_ENV`), coerces numbers, treats `""` as unset, requires `API_KEY` (≥ 16 chars) in production, enforces `DEFAULT_PAGE_SIZE ≤ MAX_PAGE_SIZE`, and throws one `ConfigError` listing **every** problem as `"VAR: message"`
- [ ] Schemas trim/normalize strings, strip unknown keys, reject strings for JSON numbers, apply defaults, coerce query values, parse `inStock` correctly (`"false"` → `false`), and enforce `minPriceCents ≤ maxPriceCents`
- [ ] `validate()` stores parsed values on `res.locals.validated` and reports issues from all parts as `{ path: "body.priceCents", message }`
- [ ] Domain errors extend `NotFoundError` / `ConflictError` / `BusinessRuleError` with codes `PRODUCT_NOT_FOUND`, `DUPLICATE_SKU`, `INSUFFICIENT_STOCK`
- [ ] The service throws them, and over-reserving changes nothing
- [ ] Error responses are `{ error: { code, message, details? } }`: validation 400 (with details), unauthorized 401, not found 404, conflict 409, business rule 422, bad JSON 400 `INVALID_JSON`, anything else a generic 500 logged via `logger.error` (expected errors are **not** logged as errors)
- [ ] `npm test` and `npm run typecheck` pass

## Getting started

```bash
cd 07-validation-errors-config/challenge
make install
make test                                   # lots of red
npx vitest run test/errors.test.ts          # one TODO at a time
make dev                                    # optional: run it
```

Try it manually once things work:

```bash
curl -i localhost:3000/products -H 'content-type: application/json' \
  -d '{"sku":" mug-01 ","name":"Mug","category":"Kitchen","priceCents":899,"stock":2}'
curl -i 'localhost:3000/products?inStock=false&limit=abc'
curl -i localhost:3000/products -H 'content-type: application/json' -d '{"sku":"x","priceCents":"12"}'
NODE_ENV=production PORT=http npm start     # watch it refuse to boot, listing both problems
```

## Rules

- Don't modify the tests.
- No new dependencies: zod is all you need.
- `process.env` appears only in `config.ts`.
- Controllers stay as they are: they read `res.locals.validated` and never touch `req.body` / `req.query` directly.
- The service must not import zod or anything from `schemas/`, `middleware/` or Express.

## Stretch goals

1. Switch the error format to RFC 9457 problem details (`application/problem+json`) and see how many files you have to touch. (Ideally one.)
2. Make `createProductSchema` a `z.strictObject` and return a helpful issue for unknown keys. Discuss the trade-off with the current "strip" behavior.
3. Add an `X-Request-Id` (module 05) and include it in error bodies and in the `logger.error` metadata.
4. Freeze the config object and type it as deeply `Readonly`.
5. Add `?sort=price|-price|createdAt|-createdAt` to the list query with a zod enum and a transform into `{ field, direction }`.

## Done?

1. `npm test` is green and `npm run typecheck` is clean.
2. Commit on your branch `module/07-validation-errors-config`, push and open a PR. CI runs this module's tests.
3. From the repo root: `npm run progress -- 07` to tick it off on the roadmap.
4. Answer the questions in [INTERVIEW.md](INTERVIEW.md).
5. Add an entry to [LOG.md](../LOG.md).
6. Compare with the reference solution: `git diff main origin/solutions -- 07-validation-errors-config/` (and read `SOLUTION.md` on that branch).

Stuck? → [HINTS.md](HINTS.md)
