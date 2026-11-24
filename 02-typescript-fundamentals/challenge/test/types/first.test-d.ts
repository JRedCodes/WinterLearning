// Type-level tests. These are never executed: the compiler checks them.
// `expectTypeOf(x).toEqualTypeOf<T>()` fails to compile unless x's type is exactly T.
// `// @ts-expect-error` fails to compile if the next line does NOT have an error.
import { expectTypeOf } from "vitest";
import { first } from "../../src/first.js";

declare const numbers: number[];
declare const pair: [string, string];
declare const atLeastOne: readonly [boolean, ...boolean[]];

// An array might be empty, so the result might be undefined.
expectTypeOf(first(numbers)).toEqualTypeOf<number | undefined>();

// A tuple with at least one element definitely has a first element.
expectTypeOf(first(pair)).toEqualTypeOf<string>();
expectTypeOf(first(atLeastOne)).toEqualTypeOf<boolean>();

// Readonly arrays must be accepted (the function doesn't mutate).
declare const frozen: readonly string[];
expectTypeOf(first(frozen)).toEqualTypeOf<string | undefined>();

// @ts-expect-error first() takes an array, not a single value
first(42);
