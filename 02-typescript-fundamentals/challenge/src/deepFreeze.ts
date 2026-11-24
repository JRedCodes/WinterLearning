/**
 * Recursively readonly version of T. Mapped and conditional types are covered
 * properly in module 08. For now, read it as "every property, at every depth,
 * becomes readonly". Functions are left as they are. This type is given;
 * you don't need to change it.
 */
export type DeepReadonly<T> = T extends (...args: never[]) => unknown
  ? T
  : T extends object
    ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
    : T;

/**
 * TODO(7): deepFreeze()
 *
 * Port legacy/deepFreeze.js and fix its crash on cyclic objects.
 *
 *  - Make it generic: `deepFreeze<T>(obj: T): DeepReadonly<T>`.
 *  - Freeze `obj` and every object/array reachable from it with Object.freeze.
 *  - Return the SAME reference (not a copy).
 *  - Primitives (numbers, strings, null) are returned unchanged.
 *  - Track visited objects (a WeakSet<object> works well) so cycles terminate.
 *
 * Tip: a small inner helper that takes `value: unknown` makes the recursion
 * easy to type. Narrow with `typeof value === "object" && value !== null`.
 *
 * Spec: test/deepFreeze.test.ts and test/types/deepFreeze.test-d.ts.
 */
export function deepFreeze(obj: unknown): unknown {
  throw new Error("Not implemented: deepFreeze (TODO 7)");
}
