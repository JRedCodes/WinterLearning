# Branded types and Result types in depth

The lesson introduced brands and `Result`. This page covers the design decisions you'll run into once you use them across a real codebase.

## How a brand actually works

```ts
declare const brand: unique symbol;
type Brand<T, Name extends string> = T & { readonly [brand]: Name };
type UserId = Brand<string, "UserId">;
```

Read it piece by piece:

- `declare const brand: unique symbol` tells the compiler "there's a constant whose type is a one-of-a-kind symbol". `declare` means no JavaScript is emitted. The symbol never exists at runtime.
- `T & { readonly [brand]: Name }` is an intersection: "a `T` that also has a property keyed by that symbol whose type is the literal `Name`".
- Because no real string has that property, a plain `"u_1"` isn't assignable to `UserId`. Because the `Name` literals differ, `UserId` and `OrderId` aren't assignable to each other.
- A `UserId` is still assignable **to** `string` (an intersection is a subtype of each part), so you can pass it to `console.log`, template strings, `Map<string, ...>` and so on.

Alternatives you'll see:

| Technique | Example | Notes |
|---|---|---|
| Unique-symbol brand (this module) | `string & { readonly [brand]: "UserId" }` | Brand key can't collide or be accessed; most robust |
| String-key brand | `string & { __brand: "UserId" }` | Simpler, but `__brand` shows up in autocomplete and can be faked |
| zod `.brand()` | `z.string().brand<"UserId">()` | Brands the schema output directly; nice when ids enter only via schemas |
| Wrapper class | `class UserId { constructor(readonly value: string) {} }` | Real runtime type, `instanceof` works, but needs (de)serialization everywhere |

For ids and money in an API, phantom brands are the sweet spot: zero runtime cost, JSON stays identical.

## Where brands are created

A brand is only as trustworthy as the code that creates it. Rules that keep it honest:

1. **One constructor per brand**, in one file. It's the only place an `as` cast to that brand appears.
2. **Validate in the constructor** whatever is cheap and always true (non-empty, format, integer, range).
3. **Call constructors at boundaries only:** controllers (params, headers), validation schemas (`.transform(Sku)`), repository row mappers, configuration and test fixtures.
4. **Never re-brand** inside services. If a service has a `string` where it needs an `OrderId`, the boundary upstream is missing a constructor call.

```mermaid
flowchart LR
  P[req.params.id: string] -->|OrderId()| C[Controller]
  H[X-User-Id header] -->|UserId()| C
  R[(DB row: text)] -->|mapper: OrderId()| Repo[Repository]
  C --> S[Service: only branded types]
  Repo --> S
```

## Branding numbers: money and quantities

`type Cents = Brand<number, "Cents">` catches "number where money was expected". Arithmetic on branded numbers yields plain `number` (`a + b` loses the brand), which is a feature: it forces you to go through helpers that preserve invariants.

```ts
export const addCents = (...xs: Cents[]): Cents => cents(xs.reduce<number>((s, x) => s + x, 0));
export const multiplyCents = (amount: Cents, qty: number): Cents => {
  if (!Number.isInteger(qty)) throw new RangeError("quantity must be an integer");
  return cents(amount * qty);
};
```

Things to decide as a team:

- **Currency.** If you handle more than one, brand per currency (`Brand<number, "EUR_cents">`) or use a `Money = { amount: Cents; currency: "EUR" | "USD" }` value object. Never add amounts of different currencies.
- **Range.** JavaScript numbers are exact integers only up to 2^53 − 1 (about 90 trillion cents, roughly 900 billion euros). Enough for most apps; ledgers at banks use `bigint` or decimal libraries.
- **Rounding.** Percentages (tax, discounts) produce fractions. Decide where rounding happens (per line or per order) and put it in one function.

## Result types: patterns and pitfalls

```ts
type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };
```

### Typed error variants

Make `E` itself a discriminated union when a caller needs to react differently to different failures:

```ts
type QuoteError =
  | { kind: "unsupported_country"; country: string }
  | { kind: "too_heavy"; maxGrams: number }
  | { kind: "carrier_down" };

function describe(e: QuoteError): string {
  switch (e.kind) {
    case "unsupported_country": return `We don't ship to ${e.country}`;
    case "too_heavy": return `Parcels are limited to ${e.maxGrams / 1000} kg`;
    case "carrier_down": return "Shipping is temporarily unavailable";
    default: return assertNever(e);
  }
}
```

### Converting at the edge

Express wants exceptions (they reach the error handler). So the service often ends with "if not ok, throw a domain error". That's fine: `Result` is for the code that *decides*, exceptions are for the code that *aborts*.

### Pitfalls

- **Forgetting to check.** `const r = parse(x); use(r.value)` doesn't compile, which is the point. But `if (r.ok) {...}` with no `else` silently drops the error. Return or throw in the failure branch.
- **Wrapping everything.** A repository method returning `Result<User, DbError>` for "the database is down" adds ceremony for something no caller can handle. Let unexpected failures throw.
- **Losing stack traces.** A plain-object error has no stack. If you need one for debugging, put an `Error` in the error variant (`{ kind: "io", cause: Error }`).

## Exceptions done well

If you stay with exceptions (most Express apps mostly do), give them structure:

```ts
export type DomainErrorCode = "ORDER_NOT_FOUND" | "UNKNOWN_SKU" | "INVALID_TRANSITION";
export class DomainError extends Error {
  constructor(readonly code: DomainErrorCode, message: string) { super(message); }
}
```

A closed union of codes gives you an exhaustive status map (`satisfies Record<DomainErrorCode, number>`) and lets clients rely on stable, documented codes. That's most of the "visible in the type" benefit of `Result`, applied to the HTTP boundary.
