/**
 * TODO(3): pick(): keyof and the Pick<T, K> utility type
 *
 * Port legacy/pick.js. Return a NEW object with only the listed keys.
 *
 *   pick({ id: "u1", email: "a@b.c", passwordHash: "x" }, ["id", "email"])
 *   // { id: "u1", email: "a@b.c" }   typed as { id: string; email: string }
 *
 *  - Generic over the object type T (constrain it to `object`) and the key
 *    type K, constrained to `keyof T`, so a typo in a key name is a compile error.
 *  - Return `Pick<T, K>`.
 *  - Only copy keys that are actually present on the object (`key in obj`).
 *
 * You may need ONE type assertion here (the object starts empty). If you use
 * one, leave a comment explaining why it is safe. `any` is not allowed.
 *
 * Spec: test/pick.test.ts and test/types/pick.test-d.ts.
 */
export function pick(obj: object, keys: string[]): object {
  throw new Error("Not implemented: pick (TODO 3)");
}
