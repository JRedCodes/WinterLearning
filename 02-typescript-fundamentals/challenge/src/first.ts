/**
 * TODO(1): first(): overloads and tuples (warm-up)
 *
 * Port legacy/first.js. Return the first element of a list.
 *
 * The interesting part is the TYPE. Write two overload signatures above the
 * implementation:
 *  - given a tuple with at least one element, e.g. `[string, string]` or
 *    `readonly [T, ...T[]]`, return `T` (it definitely exists);
 *  - given any other (possibly empty) array, return `T | undefined`.
 * Accept readonly arrays: this function doesn't mutate its input.
 *
 * Spec: test/first.test.ts (runtime) and test/types/first.test-d.ts (types).
 */
export function first(items: unknown[]): unknown {
  throw new Error("Not implemented: first (TODO 1)");
}
