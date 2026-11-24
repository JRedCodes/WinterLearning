# TypeScript for backends: cheat sheet

## Brands

```ts
declare const brand: unique symbol;
type Brand<T, N extends string> = T & { readonly [brand]: N };

type UserId = Brand<string, "UserId">;
export const UserId = (raw: string): UserId => { /* validate */ return raw as UserId; };

type Cents = Brand<number, "Cents">;
export const cents = (n: number): Cents => { if (!Number.isSafeInteger(n) || n < 0) throw new RangeError(); return n as Cents; };
```

## Discriminated unions and exhaustiveness

```ts
type Order =
  | { status: "pending"; ... }
  | { status: "shipped"; trackingNumber: string; ... };
type OrderStatus = Order["status"];
type Shipped = Extract<Order, { status: "shipped" }>;

function assertNever(x: never, ctx = "Unhandled"): never { throw new Error(`${ctx}: ${JSON.stringify(x)}`); }

switch (order.status) {
  case "pending": ...; break;
  case "shipped": ...; break;
  default: assertNever(order);
}
```

## Narrowing without casts

```ts
typeof x === "string"
x instanceof DomainError
"type" in x && x.type === "entity.parse.failed"    // after typeof x === "object" && x !== null
Array.isArray(x)
if (!user) throw ...                               // removes undefined
function isShipped(o: Order): o is Shipped { return o.status === "shipped"; }  // type predicate
```

## Result

```ts
type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };
const ok = <T>(value: T): Result<T, never> => ({ ok: true, value });
const err = <E>(error: E): Result<never, E> => ({ ok: false, error });
if (!r.ok) return handle(r.error); r.value;
```

## Utility / mapped / conditional

```ts
Partial<T>  Required<T>  Readonly<T>  Pick<T, "a" | "b">  Omit<T, "secret">
Record<K, V>  ReturnType<typeof f>  Parameters<typeof f>  Awaited<P>  NonNullable<T>
Extract<U, X>  Exclude<U, X>

type Mutable<T> = { -readonly [K in keyof T]: T[K] };
type Nullable<T> = { [K in keyof T]: T[K] | null };
type ElementOf<T> = T extends readonly (infer E)[] ? E : never;
type EventName = `${"order" | "user"}.${"created" | "deleted"}`;
```

## satisfies

```ts
const STATUS = { NOT_FOUND: 404, CONFLICT: 409 } satisfies Record<ErrorCode, number>;
const handlers = { list, get } satisfies Record<string, RequestHandler>;
```

## zod → types

```ts
const body = z.object({ sku: z.string().transform(Sku), qty: z.number().int().min(1) });
type Body = z.infer<typeof body>;        // output type (after transforms)
type BodyIn = z.input<typeof body>;      // input type (before transforms)
const r = body.safeParse(input); if (!r.success) r.error.issues; else r.data;
```

## Express typing

```ts
// src/types/express.d.ts
declare global { namespace Express {
  interface Request { user?: AuthUser }
  interface Locals { requestId: string }
} }
export {};

async function get(req: Request<{ id: string }>, res: Response<{ data: Order }>) { ... }
const mw: RequestHandler = (req, res, next) => { ... };
const onError: ErrorRequestHandler = (err: unknown, req, res, _next) => { ... };
```

## Generic repository

```ts
interface Repository<T extends { readonly id: Id }, Id> {
  findById(id: Id): Promise<T | undefined>;
  save(entity: T): Promise<void>;
}
interface OrderRepository extends Repository<Order, OrderId> { listByUser(u: UserId): Promise<Order[]>; }
```

## Declarations for untyped JS

```ts
// lib.d.ts next to lib.js
export function isValidSku(value: unknown): value is string;
// for an npm package
declare module "pkg" { export function f(x: string): number; }
```

## Type tests (vitest)

```ts
import { expectTypeOf } from "vitest";
expectTypeOf<UserId>().not.toEqualTypeOf<OrderId>();
expectTypeOf<Order["status"]>().toEqualTypeOf<"pending" | "shipped">();
expectTypeOf(fn).parameter(0).toEqualTypeOf<OrderId>();
// @ts-expect-error  ← next line MUST fail to compile
const bad: OrderId = userId;
```
Run with `tsc --noEmit` (expectTypeOf is a no-op at runtime).

## tsconfig flags worth having

`strict`, `noUncheckedIndexedAccess`, `noImplicitOverride`, `noFallthroughCasesInSwitch`, `verbatimModuleSyntax`, `isolatedModules`. Optionally `exactOptionalPropertyTypes` (distinguishes "missing" from "explicitly undefined").

## Escape-hatch replacement table

| Instead of | Use |
|---|---|
| `any` | `unknown` + narrowing / schema |
| `x as T` | constructor, schema, narrowing |
| `x!` | explicit `if (!x) throw` |
| `@ts-ignore` | fix it, or `@ts-expect-error` with a reason |
| `JSON.parse(s)` | `const v: unknown = JSON.parse(s)` then parse |
