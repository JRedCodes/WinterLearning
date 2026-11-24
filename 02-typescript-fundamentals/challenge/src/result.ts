/**
 * TODO(5a): Result<T, E>
 *
 * A Result is either a success carrying a `value` of type T, or a failure
 * carrying an `error` of type E. Model it as a discriminated union on a
 * boolean `ok` field:
 *
 *   { ok: true; value: T } | { ok: false; error: E }
 *
 * so that `if (result.ok) { result.value }` narrows correctly and reading
 * `result.value` WITHOUT checking `ok` is a compile error.
 *
 * Then implement the two constructors:
 *   ok(42)      → { ok: true, value: 42 }
 *   err("boom") → { ok: false, error: "boom" }
 *
 * Typing hint: `ok` knows nothing about the error type, and `never` is
 * assignable to every type. What should `ok`'s return type be so that
 * `const r: Result<number, string> = ok(1)` compiles?
 */

// TODO(5a): replace this placeholder.
export type Result<T, E> = unknown;

export function ok(value: unknown): unknown {
  throw new Error("Not implemented: ok (TODO 5)");
}

export function err(error: unknown): unknown {
  throw new Error("Not implemented: err (TODO 5)");
}
