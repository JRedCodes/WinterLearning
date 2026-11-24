# TypeScript cheat sheet (fundamentals)

A one-page reference for the syntax in this module. Advanced types (mapped, conditional, `infer`, branded types) are in [module 08](../../08-typescript-for-backends/README.md).

## Basic types

```ts
let s: string; let n: number; let b: boolean; let big: bigint; let sym: symbol;
let u: undefined; let nl: null;
let anything: unknown;       // top type: must narrow before use
let nothing: never;          // bottom type: no values
let list: string[];          // or Array<string>
let frozen: readonly string[];
let pair: [string, number];  // tuple
let named: [host: string, port: number];   // labeled tuple (labels are docs only)
let nonEmpty: [string, ...string[]];       // at least one element
```

## Object types

```ts
interface User {
  readonly id: string;       // can't reassign
  email: string;
  nickname?: string;         // optional → string | undefined
  [extra: string]: unknown;  // index signature (any other string key)
}

type Point = { x: number; y: number };
type Point3D = Point & { z: number };          // intersection
interface Admin extends User { level: number } // extension
```

## Unions and narrowing

```ts
type Id = string | number;
type Status = "pending" | "paid" | "refunded";

if (typeof x === "string") {}        // primitives
if (x === undefined) {}              // specific values
if ("radius" in shape) {}            // property check
if (err instanceof Error) {}         // classes only
if (Array.isArray(x)) {}             // arrays (on unknown → any[]: annotate!)
switch (shape.kind) { case "circle": ... }   // discriminated union

function isStatus(x: unknown): x is Status { ... }        // type predicate
function assert(cond: unknown, msg: string): asserts cond { if (!cond) throw new Error(msg); }
```

## Exhaustiveness

```ts
function assertNever(x: never): never { throw new Error(`Unexpected: ${JSON.stringify(x)}`); }

switch (s) {
  case "pending": ...; break;
  case "paid": ...; break;
  case "refunded": ...; break;
  default: assertNever(s);   // compile error if a case is missing
}
```

## Functions

```ts
function add(a: number, b: number): number { return a + b; }
const add2 = (a: number, b: number): number => a + b;
type BinaryOp = (a: number, b: number) => number;

function greet(name: string, greeting = "hi", suffix?: string) {}  // default + optional
function sum(...nums: number[]) {}                                  // rest

// overloads: specific first, implementation last (not callable directly)
function parse(x: string): number;
function parse(x: string[]): number[];
function parse(x: string | string[]): number | number[] { ... }
```

## Generics

```ts
function identity<T>(x: T): T { return x; }
function longest<T extends { length: number }>(a: T, b: T): T { ... }  // constraint
function get<T, K extends keyof T>(obj: T, key: K): T[K] { return obj[key]; }
function wrap<T = string>(x: T) {}                                       // default type arg

class Box<T> { constructor(public value: T) {} }
interface Repo<T> { findById(id: string): Promise<T | undefined> }
```

## Type operators

```ts
keyof User                  // "id" | "email" | "nickname"
User["email"]               // string (indexed access)
typeof config               // the type of a VALUE
(typeof LEVELS)[number]     // element type of an array/tuple
```

## Literal types and `as const`

```ts
const LEVELS = ["debug", "info", "warn", "error"] as const;  // readonly tuple of literals
type Level = (typeof LEVELS)[number];                        // "debug" | "info" | "warn" | "error"

const ROUTES = { home: "/", users: "/users" } as const;
type Route = (typeof ROUTES)[keyof typeof ROUTES];           // "/" | "/users"

const cfg = { port: 8080 } satisfies { port: number };       // check without widening
```

## Utility types

| | |
|---|---|
| `Partial<T>` / `Required<T>` | all optional / all required |
| `Readonly<T>` | all readonly (shallow) |
| `Pick<T, K>` / `Omit<T, K>` | keep / drop properties |
| `Record<K, V>` | object type from key and value types |
| `Exclude<U, X>` / `Extract<U, X>` | filter a union |
| `NonNullable<T>` | remove `null` and `undefined` |
| `ReturnType<F>` / `Parameters<F>` | function parts |
| `Awaited<P>` | unwrap a Promise |

## Modules (NodeNext, ESM)

```ts
import { groupBy } from "./groupBy.js";           // .js even though the file is .ts
import type { User } from "./types.js";           // type-only, erased
import { type Result, ok } from "./result.js";    // mixed
import fs from "node:fs/promises";                // built-ins with node: prefix
export { thing } from "./thing.js";               // re-export
export type { Thing } from "./thing.js";
```

## Assertions (use sparingly)

```ts
value as Type          // trust me (unchecked!). Comment why it's safe.
value!                 // non-null assertion: trust me, it's not null/undefined
value satisfies Type   // CHECK that it fits, keep the narrower inferred type
```

## Commands

```bash
npx tsc --noEmit          # type check only
npx tsc --noEmit --watch  # keep checking on save
npx tsx src/file.ts       # run without type checking
npx tsc --showConfig      # print the effective tsconfig
```
