# Reading scary TypeScript errors

TypeScript errors are long because the compiler shows its work. Once you know how to read them, most take seconds to understand. This guide walks through real errors you'll hit in this module and the next few.

## The method

1. **Find the location.** `src/pick.ts(12,5)` means file `src/pick.ts`, line 12, column 5. Your editor jumps there on click.
2. **Read the last indented line first.** That's the most specific mismatch. The lines above it say *how* the compiler got from your code to that mismatch.
3. **Ask: who is wrong, the value or the type?** Sometimes the code has a bug. Sometimes the annotation is too narrow or too wide. The error can't tell you which. You decide.
4. **Hover.** In VS Code, hovering a variable shows its inferred type. Most "why is this an error?" moments end with "oh, it inferred `string`, not `"info"`".

## Example 1: a nested object mismatch

```
test/eventBus.test-d.ts(31,24): error TS2345: Argument of type '{ orderId: string; cents: string; }'
is not assignable to parameter of type '{ orderId: string; cents: number; }'.
  Types of property 'cents' are incompatible.
    Type 'string' is not assignable to type 'number'.
```

Bottom-up: `string` isn't `number` → in property `cents` → of the argument. The payload had `cents: "100"`. That's the error working as intended. (In the challenge this line has `// @ts-expect-error` above it: the test *wants* this error.)

## Example 2: "possibly undefined"

```
src/groupBy.ts(9,5): error TS18048: 'bucket' is possibly 'undefined'.
```

You wrote something like `groups[key].push(item)`. With `noUncheckedIndexedAccess`, reading a record by key returns `T[] | undefined`, because the key might not be there yet. Don't reach for `!`. Handle the missing case:

```ts
const bucket = groups[key];
if (bucket) bucket.push(item);
else groups[key] = [item];
```

## Example 3: unknown

```
src/parseConfig.ts(20,7): error TS18046: 'input' is of type 'unknown'.
```

You accessed `input.port` on an `unknown`. Narrow first:

```ts
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
if (!isRecord(input)) return err([{ path: "", message: "config must be an object" }]);
input.port; // unknown, but now you're allowed to read it
```

## Example 4: the generic that doesn't fit its constraint

```
src/groupBy.ts(4,49): error TS2322: Type 'K' is not assignable to type 'string | number | symbol'.
  Type 'K' is not assignable to type 'symbol'.
```

You wrote `Record<K, T[]>` but `K` is unconstrained: a caller could pick `K = { role: string }`, which can't be an object key. Add the constraint: `K extends PropertyKey`. When you see "Type 'T' is not assignable to..." about a *type parameter*, the fix is usually a constraint.

## Example 5: Expected vs Actual from `expectTypeOf`

```
test/types/groupBy.test-d.ts(14,50): error TS2344: Type 'Partial<Record<"admin" | "member", User[]>>'
does not satisfy the constraint '{ admin: "Expected: ..., Actual: ..."; ... }'.
```

`expectTypeOf` produces strange-looking errors by design: it builds an object type whose property *names* describe what went wrong. Look for the words `Expected:` and `Actual:` in the message. Typical causes in this challenge:

- You returned `Record<K, T[]>` where the test expects `Partial<Record<K, T[]>>`.
- Your type is *wider* than expected (`string` instead of `"debug" | "info" | ...`): you forgot `as const`.
- Your type has `readonly` where the test doesn't expect it, or the other way round.

## Example 6: unused `@ts-expect-error`

```
test/types/pick.test-d.ts(9,1): error TS2578: Unused '@ts-expect-error' directive.
```

The line after the directive compiled fine, but the test expected it to fail. Your types are too loose. For `pick(user, ["id", "emial"])` that means `keys` isn't constrained to `keyof T`.

## Example 7: the overload error

```
error TS2769: No overload matches this call.
  Overload 1 of 2, '(items: readonly [unknown, ...unknown[]]): unknown', gave the following error.
    Argument of type 'number' is not assignable to parameter of type 'readonly [unknown, ...unknown[]]'.
  Overload 2 of 2, '(items: readonly unknown[]): unknown', gave the following error.
    Argument of type 'number' is not assignable to parameter of type 'readonly unknown[]'.
```

With overloads, the compiler reports why *each* signature was rejected. Read the one you intended to match.

## Example 8: the error is somewhere else

Sometimes the error appears at a call site, but the real mistake is a missing or wrong return type annotation on the function. If a function's inferred return type is `string | undefined` because one branch forgets to return, every caller lights up. Annotate return types on exported functions and the error moves to where the bug actually is.

## Example 9: implicit any

```
error TS7006: Parameter 'u' implicitly has an 'any' type.
```

TypeScript couldn't infer the parameter. Either annotate it or make the surrounding function generic so the type flows in (that's what `groupBy<T, K>` does for `keyFn`'s parameter).

## When you're stuck

- Simplify: copy the failing expression into a `const tmp = ...` and hover it.
- Annotate intermediate values with what you *think* they are. The error moves closer to the real problem.
- Read the error code (`TS2345`) and search the official docs or the TypeScript repo issues.
- Resist `as`. If you use it, write a comment proving to a reviewer why the value really is that type.
