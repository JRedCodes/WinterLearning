# Hints · TypeScript Fundamentals

Open one hint at a time. Give each a real try before opening the next. `npm run typecheck` output plus [docs/reading-ts-errors.md](docs/reading-ts-errors.md) will answer a lot on their own.

## TODO 1: `first`

<details><summary>Hint 1</summary>

The implementation is one line. All the work is in the signatures. Overload signatures are just function declarations without a body, stacked above the real one.
</details>

<details><summary>Hint 2</summary>

A "tuple with at least one element" is written `readonly [T, ...T[]]`. A plain `[string, string]` is assignable to it. Overloads are tried top to bottom, so the tuple signature has to come first.
</details>

<details><summary>Hint 3</summary>

```ts
export function first<T>(items: readonly [T, ...T[]]): T;
export function first<T>(items: readonly T[]): T | undefined;
export function first<T>(items: readonly T[]): T | undefined { /* ... */ }
```
</details>

## TODO 2: `groupBy`

<details><summary>Hint 1</summary>

You need two type parameters: one for the items, one for the key. Where does each get inferred from?
</details>

<details><summary>Hint 2</summary>

`Record<K, ...>` requires `K` to be a valid key type, so constrain it: `K extends PropertyKey`. Inside the function, start with `const groups: Partial<Record<K, T[]>> = {}`. Reading `groups[key]` gives `T[] | undefined`. That's correct, handle both cases.
</details>

<details><summary>Hint 3</summary>

Signature: `groupBy<T, K extends PropertyKey>(items: readonly T[], keyFn: (item: T) => K): Partial<Record<K, T[]>>`. In the loop: read the bucket into a local `const`, push if it exists, else assign `[item]`.
</details>

## TODO 3: `pick`

<details><summary>Hint 1</summary>

The keys array should only accept names that exist on the object. Which operator gives you "the names of T's properties"?
</details>

<details><summary>Hint 2</summary>

`pick<T extends object, K extends keyof T>(obj: T, keys: readonly K[]): Pick<T, K>`. Inside, `out[key] = obj[key]` type-checks if `out` is a `Partial<Pick<T, K>>`.
</details>

<details><summary>Hint 3</summary>

After the loop, TypeScript still thinks `out` is `Partial<...>`. One `return out as Pick<T, K>` with a comment ("every requested key present on obj has been copied") is the accepted trade-off here.
</details>

## TODO 4: `Shape` and `area`

<details><summary>Hint 1</summary>

Three interfaces, each with a `kind` property whose type is a single string literal, then `type Shape = A | B | C`.
</details>

<details><summary>Hint 2</summary>

`assertNever`'s parameter type is the whole trick: `(value: never): never`. Inside `switch (shape.kind)`, each `case` narrows `shape`, and in `default` it's `never` if you covered everything.
</details>

<details><summary>Hint 3</summary>

```ts
default:
  return assertNever(shape);
```
`assertNever` throws `new Error(`Unexpected value: ${JSON.stringify(value)}`)`.
</details>

## TODO 5: `Result` and `parseConfig`

<details><summary>Hint 1</summary>

`Result<T, E>` is a union of two object types that differ in a literal `ok: true` / `ok: false` field. For `ok()`, the error side can be anything, and `never` fits into every type.
</details>

<details><summary>Hint 2</summary>

- `ok<T>(value: T): Result<T, never>` and `err<E>(error: E): Result<never, E>`.
- `export const LOG_LEVELS = [...] as const;` then `export type LogLevel = (typeof LOG_LEVELS)[number];`
- `isLogLevel(value: unknown): value is LogLevel`. `LOG_LEVELS.includes(value)` won't accept a plain `string` argument: widen the array with `(LOG_LEVELS as readonly string[])` after checking `typeof value === "string"`.
- Write an `isRecord(value: unknown): value is Record<string, unknown>` predicate for the "is it a plain object" check.
</details>

<details><summary>Hint 3</summary>

Pull each field out (`const { port } = input`, `const host = input.host ?? "localhost"`), push into an `errors: ConfigError[]` array as you check each one, and at the end:

```ts
if (errors.length > 0 || typeof port !== "number" || typeof host !== "string" || !isLogLevel(logLevel)) {
  return err(errors);
}
return ok({ port, host, logLevel, features });
```
The repeated checks look redundant, but they're what lets the compiler *prove* the object is an `AppConfig` without `as`. For features: `Array.isArray` gives you `any[]`, so annotate the callback parameter as `unknown`.
</details>

## TODO 6: `EventBus`

<details><summary>Hint 1</summary>

Start with the public signatures and ignore storage. `on<K extends keyof Events>(event: K, handler: Handler<Events[K]>)`. Once the type tests for the public API pass, worry about where handlers live.
</details>

<details><summary>Hint 2</summary>

Storage that keeps the name → payload link: `{ [K in keyof Events]?: Set<Handler<Events[K]>> }`, initialized to `{}`. Reading `this.handlers[event]` then gives `Set<Handler<Events[K]>> | undefined`, exactly what you need, no casts. A `#private` field or `private readonly` both work.
</details>

<details><summary>Hint 3</summary>

- `on`: get-or-create the set, add the handler, return `() => { set.delete(handler); }` (braces, so the arrow returns `void`, not `boolean`).
- `once`: `const off = this.on(event, (payload) => { off(); handler(payload); }); return off;`
- `emit`: `for (const h of [...set]) h(payload);` The spread is the copy that fixes the legacy bug.
</details>

## TODO 7: `deepFreeze`

<details><summary>Hint 1</summary>

The public function is generic and the recursion doesn't need to be. Split it: `deepFreeze<T>(obj: T): DeepReadonly<T>` calls a private helper that takes `unknown`.
</details>

<details><summary>Hint 2</summary>

In the helper: bail out if `typeof value !== "object" || value === null`. Keep a `WeakSet<object>` of visited objects and return early if you've seen this one. Recurse into `Object.values(value)`, then `Object.freeze(value)`.
</details>

<details><summary>Hint 3</summary>

The return needs one assertion: `return obj as DeepReadonly<T>`, with a comment that every level has been frozen at runtime, so the deeper readonly type is accurate.
</details>
