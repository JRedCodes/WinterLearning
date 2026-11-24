# Challenge · Order Fulfilment: let the compiler find the bugs

**Type:** 🐛 Debug · **Est:** 3–4h · **Services:** none

## Scenario

> **#incidents** · *Marco (on-call):* Rough week for the orders service. Since we ported it from JavaScript to TypeScript "it compiles", but support has five open tickets. I've pasted them below. The port was done fast: there are `any`s and `as` casts everywhere, so the compiler isn't actually checking much.
>
> *Priya (tech lead):* Let's not just patch the symptoms. Tighten the types so this class of bug **can't** come back: branded ids, a proper status union, validated DTOs, typed `req.user`. The tests include type-level checks, and there's a rule now: no `any`, no casts. Fix the five bugs along the way. I bet once the types are honest, the compiler points at most of them for you.

### The tickets

| # | Ticket | Reported symptom |
|---|---|---|
| 1 | SUP-311 | "Cancel order" always says **Order not found**, even for a customer's own brand-new order. Customer can see the order fine with `GET /orders/:id`. |
| 2 | SUP-318 | A customer cancelled an order **after** the warehouse had already packed it. The box was shipped anyway and finance had to refund manually. |
| 3 | SUP-322 | Our monitoring shows **500 Internal Server Error** spikes on every endpoint when someone sends an `X-User-Id` that isn't in our user directory. It should be a 401. |
| 4 | SUP-327 | Customers get a "Your order has shipped" email with **no tracking number**. The carrier dashboard shows the shipments were booked fine. |
| 5 | SUP-330 | Order totals are absurd: a €25.98 basket with €4.99 shipping shows a total of **€25,984.99**. |

There are exactly **5 bugs**, one per ticket. Plus a typing job: the starter code is full of `any`, `as` casts and loose types that hid those bugs.

## Your task

1. **Run the tests and read them.** `npm test` runs `tsc --noEmit` first (type-level tests live in `test/types.test.ts`), then Vitest. Use `npx vitest run` to see runtime failures while you still have type errors.
2. **Brand the ids and money** in `src/domain/ids.ts` and `src/domain/money.ts`: `UserId`, `OrderId` and `Sku` must be distinct nominal types, and `Cents` must be a branded integer. The same-named constructor functions stay (tests use them) and become the only place a cast is allowed. Id constructors reject empty strings.
3. **Model orders as a discriminated union** in `src/domain/order.ts`: one type per status (`pending`, `paid`, `packed`, `shipped`, `cancelled`), each with exactly the fields that exist in that state. `OrderStatus` must be the closed union of those literals. Make status switches exhaustive (use a `never` check).
4. **Type the repositories** with a generic `Repository<T, Id>` interface; `OrderRepository` extends it keyed by `OrderId`. Lookups return `T | undefined`.
5. **Type Express**: add `src/types/express.d.ts` that merges `user?: AuthUser` into `Express.Request` and `requestId: string` into `Express.Locals`. Remove every `(req as any)`.
6. **Validate at the boundaries with zod**:
   - Derive `PlaceOrderBody` in `src/controllers/dto.ts` from a schema (`z.infer`). Rules: `country` is two upper-case letters; `lines` has 1–50 entries; `sku` is normalized with `normalizeSku` and must pass `isValidSku`, and comes out as a `Sku`; `quantity` is an integer 1–99 (strings are rejected). Invalid → `400 VALIDATION_ERROR`.
   - Parse the carrier's responses (see the reference below) in `src/integrations/carrierClient.ts`. Map them to domain types. A response that doesn't match the documented shape → `502 CARRIER_BAD_RESPONSE`, and the order is left unchanged.
7. **Describe the vendored JS** honestly: rewrite `src/vendor/sku-check.d.ts` without `any` (don't edit the `.js`).
8. **Type the config** in `src/config.ts` (no `any`; a zod schema is a good fit).
9. **Fix the 5 bugs.** Most of them become compile errors once steps 2–6 are done.

Keep the layering: controllers do HTTP and validation, services hold the rules, repositories store data, integrations talk to the outside world.

### Carrier API reference (from the carrier's docs)

`POST /v2/quotes` request `{ "destination_country": "DE", "weight_grams": 700 }`, response:

```json
{ "service": "standard", "amount_cents": "499", "currency": "EUR" }
```

> `amount_cents` is an integer encoded as a **string** of digits. `currency` is always `"EUR"` for our account.

`POST /v2/shipments` request `{ "reference": "<our order id>", "destination_country": "DE", "weight_grams": 700 }`, response:

```json
{ "tracking_number": "1Z999AA10123456784", "carrier": "ups", "eta_days": 3 }
```

## Acceptance criteria

Runtime (`test/orders.test.ts`):

- [ ] Missing or unknown `X-User-Id` → `401 UNAUTHENTICATED` (never a 500).
- [ ] Only `warehouse` users can pack/ship (`403 FORBIDDEN` otherwise).
- [ ] `POST /orders` → `201` + `Location`; `subtotalCents`, `shippingCents`, `totalCents` are **numbers** (2 mugs = 2598 + 499 = 3097).
- [ ] The carrier is asked for a quote with the total weight; SKUs are normalized.
- [ ] Invalid bodies → `400 VALIDATION_ERROR`; unknown SKU → `422 UNKNOWN_SKU`.
- [ ] Malformed carrier responses → `502 CARRIER_BAD_RESPONSE`; a failed shipment leaves the order `packed`.
- [ ] Customers see only their own orders (`404 ORDER_NOT_FOUND` for others').
- [ ] Pay `pending` → `paid`; invalid transitions → `409 INVALID_TRANSITION`.
- [ ] Customers can cancel `pending` and `paid` orders; `packed` → `409 ORDER_NOT_CANCELLABLE`.
- [ ] Shipping stores the carrier's tracking number and carrier name.
- [ ] Malformed JSON → `400 INVALID_JSON`; error bodies include the request id.

Type-level (`test/types.test.ts`, checked by `tsc`):

- [ ] `UserId`, `OrderId`, `Sku` are distinct; plain strings aren't assignable to them; swapping `cancelOrder(userId, orderId)` arguments doesn't compile.
- [ ] `OrderStatus` is exactly `"pending" | "paid" | "packed" | "shipped" | "cancelled"`; only shipped orders have `trackingNumber`/`carrier`.
- [ ] `Order["totalCents"]` is `Cents`; a bare number isn't `Cents`.
- [ ] `OrderRepository["findById"]` takes an `OrderId` and resolves to `Order | undefined`.
- [ ] `Express.Request["user"]` is `AuthUser | undefined`; `Express.Locals["requestId"]` is `string`.
- [ ] `PlaceOrderBody` is `{ country: string; lines: { sku: Sku; quantity: number }[] }`.

Strictness (`test/strictness.test.ts`):

- [ ] No `any` anywhere in `src/` (including `.d.ts`).
- [ ] No `as` casts in `src/` except in `domain/ids.ts` and `domain/money.ts` (`as const` is fine).

- [ ] `npm test` (typecheck + tests) passes.

## Getting started

```bash
cd 08-typescript-for-backends/challenge
make install
make test           # tsc fails first: that's the type-level tests talking
npx vitest run      # runtime tests only, while you work through the types
npm run test:watch
```

Suggested order: ids and money → order union → repositories → Express typing → DTO schema → carrier client → config and `.d.ts` → clean up the last `any`/casts. Rerun `npx tsc --noEmit` often: each new compile error in `src/` is a place the old code was relying on something untrue.

## Rules

- Don't modify the tests (`test/`), and don't edit `src/vendor/sku-check.js`.
- Don't silence the compiler: no `any`, no `@ts-ignore`, no `as unknown as`, no non-null assertions (`!`) to make an error go away.
- Keep the public shape that tests use: `createApp({ orderService, users })`, the `OrderService` constructor deps and method names, the constructors `UserId()`, `OrderId()`, `Sku()`, `cents()`, `InMemoryCatalog`, `InMemoryUserDirectory`, `InMemoryOrderRepository`, `CarrierClient(transport)`.
- No new dependencies (zod is already installed).

## Stretch goals

1. Add a `delivered` status (set by a `POST /orders/:id/deliver` warehouse endpoint). Notice how the compiler walks you to every place that needs a decision.
2. Make `Cents` arithmetic impossible to get wrong by adding a `Money` value object with a currency, and reject adding EUR to USD at compile time.
3. Type the response bodies: `Response<{ data: Order }>` in the controllers.
4. Brand the country code (`CountryCode`) and derive it from the schema with zod's `.brand()`.
5. Add an ESLint config with `@typescript-eslint/no-unsafe-*` rules and see what else they catch.

## Done?

1. `npm test` is green (typecheck + tests).
2. Commit on your branch `module/08-typescript-for-backends`, push and open a PR. CI runs this module's tests. Ask Claude to review the PR if you want feedback.
3. From the repo root: `npm run progress -- 08` to tick it off on the roadmap.
4. Answer the questions in [INTERVIEW.md](INTERVIEW.md).
5. Add an entry to [LOG.md](../LOG.md): which bugs did the compiler find for you?
6. Compare with the reference solution: `git diff main origin/solutions -- 08-typescript-for-backends/` (and read `SOLUTION.md` on that branch).

Stuck? → [HINTS.md](HINTS.md)
