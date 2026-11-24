# TypeScript cheat sheet

> Strict TypeScript for Node 22 backends. Taught in [02 · TypeScript Fundamentals](../../02-typescript-fundamentals/README.md) and [08 · TypeScript for Backends](../../08-typescript-for-backends/README.md).

## Project setup (every `challenge/` uses this)

```jsonc
// tsconfig.json (key flags)
{
  "compilerOptions": {
    "target": "ES2023",
    "module": "NodeNext",            // Node's real ESM/CJS rules
    "moduleResolution": "NodeNext",
    "strict": true,                   // all the strict checks
    "noUncheckedIndexedAccess": true, // arr[0] is T | undefined
    "verbatimModuleSyntax": true,     // type-only imports must say `import type`
    "isolatedModules": true,
    "skipLibCheck": true
  }
}
```

```bash
npx tsc --noEmit          # typecheck only (npm run typecheck)
npx tsx src/server.ts     # run TS directly
npx tsx watch src/server.ts   # npm run dev
```

**ESM import rule:** with `"type": "module"` + NodeNext, relative imports need the `.js` extension, even in `.ts` files:

```ts
import { createApp } from "./app.js";          // correct (resolves app.ts)
import type { Task } from "./domain/task.js";   // type-only import
```

## Types at a glance

```ts
let id: string; let n: number; let ok: boolean; let big: bigint;
const tags: string[] = [];             // or Array<string>
const pair: [string, number] = ["a", 1]; // tuple
type Point = { x: number; y: number; label?: string }; // optional prop
interface User { readonly id: string; email: string }  // readonly prop
type Status = "pending" | "paid" | "shipped";          // literal union
type Dict = Record<string, number>;
```

`interface` vs `type`: both describe object shapes. `interface` can be extended and merged (needed for Express declaration merging). `type` can express unions, tuples and mapped types. Pick one style per codebase; use `type` when you need unions.

## Narrowing

```ts
function f(x: string | number | Date | null) {
  if (x === null) return;
  if (typeof x === "string") x.toUpperCase();
  else if (x instanceof Date) x.getTime();
  else x.toFixed(2);
}
if ("email" in obj) { /* obj has email */ }

// discriminated union + exhaustive switch
type Shape = { kind: "circle"; r: number } | { kind: "rect"; w: number; h: number };
function area(s: Shape): number {
  switch (s.kind) {
    case "circle": return Math.PI * s.r ** 2;
    case "rect":   return s.w * s.h;
    default: { const never: never = s; throw new Error(`unhandled ${String(never)}`); }
  }
}

// type predicate
function isString(v: unknown): v is string { return typeof v === "string"; }
```

## `unknown`, `any`, `never`

| Type | Meaning | Use |
|---|---|---|
| `unknown` | "could be anything, prove it first" | untrusted input: `JSON.parse`, `req.body`, `catch (e)` |
| `any` | turns the type checker off | avoid; banned in this repo's tests |
| `never` | "can't happen" | exhaustiveness checks, functions that always throw |

```ts
try { ... } catch (err: unknown) {
  const msg = err instanceof Error ? err.message : String(err);
}
```

## Generics

```ts
function first<T>(xs: readonly T[]): T | undefined { return xs[0]; }
function groupBy<T, K extends PropertyKey>(xs: T[], key: (x: T) => K): Record<K, T[]> { /* ... */ }
interface Repository<T, Id> { findById(id: Id): Promise<T | null>; save(e: T): Promise<void> }
```

## Utility types

| Utility | Result |
|---|---|
| `Partial<T>` / `Required<T>` | all props optional / required |
| `Readonly<T>` | all props readonly |
| `Pick<T, "a" \| "b">` / `Omit<T, "id">` | subset / everything except |
| `Record<K, V>` | object with keys K and values V |
| `ReturnType<typeof fn>` / `Parameters<typeof fn>` | infer from a function |
| `Awaited<P>` | unwrap a Promise type |
| `NonNullable<T>` | remove `null \| undefined` |
| `Extract<U, X>` / `Exclude<U, X>` | filter a union |

## Backend patterns

```ts
// as const: literal types from values
export const ROLES = ["admin", "member"] as const;
export type Role = (typeof ROLES)[number];          // "admin" | "member"

// satisfies: check a value against a type without widening it
const config = { port: 3000, env: "dev" } satisfies Record<string, string | number>;

// branded ids: stop passing a UserId where an OrderId is expected
type Brand<T, B extends string> = T & { readonly __brand: B };
type UserId = Brand<string, "UserId">;
type OrderId = Brand<string, "OrderId">;

// Result instead of throwing for expected failures
type Result<T, E = Error> = { ok: true; value: T } | { ok: false; error: E };

// derive types from zod schemas (single source of truth)
import { z } from "zod";
const CreateTask = z.object({ title: z.string().min(1), due: z.coerce.date().optional() });
type CreateTask = z.infer<typeof CreateTask>;

// Express 5: type req.user via declaration merging (src/types/express.d.ts)
declare global {
  namespace Express { interface Request { user?: { id: UserId; role: Role } } }
}
export {};
```

## Reading scary errors

- Read the **last** line of a long error first; it's usually the concrete mismatch.
- `Type 'X | undefined' is not assignable to 'X'`: handle the undefined case (`noUncheckedIndexedAccess` on arrays and records).
- `Object is possibly 'null'`: narrow with an `if` or return early.
- `has no exported member` / `Cannot find module './x'`: missing `.js` extension or wrong path under NodeNext.
- `'X' is a type and must be imported using a type-only import`: use `import type`.
- `Argument of type 'string' is not assignable to parameter of type '"a" | "b"'`: the value widened; use `as const` or annotate.

## Gotchas

- `as` casts silence the compiler; they don't convert or check anything at runtime. Validate instead.
- Types vanish at runtime. Data from HTTP, env, DB and JSON is `unknown` until validated (zod).
- `pg` returns `bigint` and `numeric` columns as **strings**. Type your row mappers accordingly.
- `enum` generates runtime code and has quirks; prefer literal unions + `as const` arrays.
- `Object.keys(obj)` returns `string[]`, not `(keyof T)[]`, on purpose.
- Optional (`a?: T`) is not the same as `a: T | undefined` (the key may be absent entirely).
