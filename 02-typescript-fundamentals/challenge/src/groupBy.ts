/**
 * TODO(2): groupBy(): generics with a constraint
 *
 * Port legacy/groupBy.js.
 *
 *   groupBy(users, (u) => u.role)  // { admin: User[], member: User[] }
 *
 * Make it generic over the item type T and the key type K:
 *  - T is inferred from `items`, so `keyFn`'s parameter is typed for free.
 *  - K must be usable as an object key: constrain it with `extends PropertyKey`
 *    (that's string | number | symbol).
 *  - Return type: a group that has no members is NOT in the result, so the
 *    honest type is `Partial<Record<K, T[]>>`. Think about why `Record<K, T[]>`
 *    would be a lie when K is "admin" | "member".
 *  - Accept `readonly T[]` and don't mutate it. Keep input order inside a group.
 *
 * Spec: test/groupBy.test.ts and test/types/groupBy.test-d.ts.
 */
export function groupBy(items: unknown[], keyFn: (item: unknown) => unknown): unknown {
  throw new Error("Not implemented: groupBy (TODO 2)");
}
