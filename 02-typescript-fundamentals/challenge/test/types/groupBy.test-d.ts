import { expectTypeOf } from "vitest";
import { groupBy } from "../../src/groupBy.js";

interface User {
  name: string;
  role: "admin" | "member";
  age: number;
}
declare const users: User[];

// The key type flows from keyFn, the item type from the array. A group might
// be missing, so the record is Partial.
expectTypeOf(groupBy(users, (u) => u.role)).toEqualTypeOf<Partial<Record<"admin" | "member", User[]>>>();
expectTypeOf(groupBy(users, (u) => u.age)).toEqualTypeOf<Partial<Record<number, User[]>>>();

// keyFn's parameter is inferred as User (no annotation needed).
groupBy(users, (u) => {
  expectTypeOf(u).toEqualTypeOf<User>();
  return u.name;
});

// Readonly input is fine.
declare const frozen: readonly User[];
groupBy(frozen, (u) => u.role);

// @ts-expect-error a key must be a string, number or symbol, not an object
groupBy(users, (u) => ({ role: u.role }));

// @ts-expect-error `email` does not exist on User
groupBy(users, (u) => u.email);
