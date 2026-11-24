# Hints · TypeScript for Backends

Open one hint at a time. Give each a real try before opening the next.

## Getting oriented

<details><summary>Hint 1</summary>

Run `npx tsc --noEmit` and read only the errors in `test/types.test.ts`. Each one maps to a type you need to change in `src/`. "Unused '@ts-expect-error' directive" means "this line should be an error, but your types allow it".
</details>

<details><summary>Hint 2</summary>

Work from the inside out: domain types first (ids, money, order), then the layers that use them. Each time you tighten a domain type, new errors appear in services and controllers. Those errors are the point: several of them are the bugs.
</details>

## Branded ids and `Cents`

<details><summary>Hint 1</summary>

A type alias (`type UserId = string`) is not a new type. You need something that a plain string doesn't have.
</details>

<details><summary>Hint 2</summary>

Intersect with a property keyed by a `unique symbol` that only exists at the type level (`declare const brand: unique symbol`). The lesson's section 4 has the shape. Keep a function with the same name as the type: TypeScript allows a type and a value to share a name.
</details>

<details><summary>Hint 3</summary>

```ts
type Brand<T, N extends string> = T & { readonly [brand]: N };
export type OrderId = Brand<string, "OrderId">;
export const OrderId = (raw: string): OrderId => { /* reject empty */ return raw as OrderId; };
```
`Cents` is `Brand<number, "Cents">`, and `addCents` should reduce to a `number` and then call `cents(...)` on the result.
</details>

## The order union and exhaustive switches (tickets SUP-318)

<details><summary>Hint 1</summary>

`status: string` lets anything through. What if each status were its own type with only the fields that exist in that state?
</details>

<details><summary>Hint 2</summary>

Write a shared base (id, userId, lines, money, createdAt) and five types that intersect it with `{ status: "pending" }`, `{ status: "paid"; paidAt: string }`, and so on. `OrderStatus = Order["status"]`. Then look at every `switch` over a status. What happens to a status that isn't listed?
</details>

<details><summary>Hint 3</summary>

Remove the permissive `default: return true` and replace it with `default: return assertNever(order)`, where `assertNever(value: never): never` throws. The compiler then tells you which status is missing from `canCancel`. In the service, small transition functions like `pack(order: PaidOrder, at): PackedOrder` force you to narrow with `if (order.status !== "paid") throw ...` before calling them.
</details>

## Typed `req.user` and the unknown-user crash (SUP-311, SUP-322)

<details><summary>Hint 1</summary>

Once `req.user` has a real type and the ids are branded, look again at the arguments the controllers pass to the service. And at what `findById` can return.
</details>

<details><summary>Hint 2</summary>

Create `src/types/express.d.ts` with `declare global { namespace Express { interface Request { user?: AuthUser } interface Locals { requestId: string } } }` and `export {}`. Type `UserDirectory.findById(id: UserId): Promise<User | undefined>` and give `InMemoryUserDirectory` a typed `readonly User[]`.
</details>

<details><summary>Hint 3</summary>

With `noUncheckedIndexedAccess`, `filter(...)[0]` is `User | undefined`, so `user.id` won't compile until you add `if (!user) throw new HttpError(401, "UNAUTHENTICATED", ...)`. In the cancel controller, brand the param with `OrderId(req.params.id)` and the compiler will flag the argument order. Use a `currentUser(req: { user?: AuthUser })` helper to get a non-optional user in handlers. For `req.params.id`, type controller handlers as `Request<{ id: string }>`.
</details>

## The DTO and the carrier (SUP-327, SUP-330)

<details><summary>Hint 1</summary>

Compare the field names and types the code reads with the "Carrier API reference" in CHALLENGE.md. What does `+` do with a number and a string?
</details>

<details><summary>Hint 2</summary>

Make the transport return `Promise<unknown>`. Then you can't read any field without validating first. Write a zod schema per response that mirrors the documented wire format exactly (snake_case, `amount_cents` as a digit string), parse, and map to your domain types (`trackingNumber`, `amountCents: Cents`).
</details>

<details><summary>Hint 3</summary>

```ts
const shipmentResponse = z.object({ tracking_number: z.string().min(1), carrier: z.string(), eta_days: z.number().int() });
const r = shipmentResponse.safeParse(raw);
if (!r.success) throw new DomainError("CARRIER_BAD_RESPONSE", "...");
return { trackingNumber: r.data.tracking_number, ... };
```
For the quote: `amountCents: cents(Number(r.data.amount_cents))`. Give `DomainError` a closed `DomainErrorCode` union and use `satisfies Record<DomainErrorCode, number>` for the status map. For the request body, the SKU chain is `z.string().transform(normalizeSku).refine(isValidSku, ...).transform(Sku)`, and `type PlaceOrderBody = z.infer<typeof placeOrderBody>`.
</details>

## The last `any`s and casts

<details><summary>Hint 1</summary>

The strictness test prints file and line for every hit. Work through the list.
</details>

<details><summary>Hint 2</summary>

`sku-check.d.ts`: inputs are `unknown`; `isValidSku` can be a type guard (`value is string`). The error handler's `err` should be `unknown`; detect the JSON parse error with `typeof err === "object" && err !== null && "type" in err && err.type === "entity.parse.failed"`. Config: a zod env schema with `z.coerce.number()` for the port, `loadConfig(env: NodeJS.ProcessEnv = process.env)`.
</details>
