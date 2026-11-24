import { expectTypeOf } from "vitest";
import { pick } from "../../src/pick.js";

const user = { id: "u1", email: "ada@example.com", passwordHash: "x", age: 36 };

expectTypeOf(pick(user, ["id", "email"])).toEqualTypeOf<{ id: string; email: string }>();
expectTypeOf(pick(user, ["age"])).toEqualTypeOf<{ age: number }>();

// @ts-expect-error a typo in a key name is caught at compile time
pick(user, ["id", "emial"]);

// @ts-expect-error the result doesn't have keys that weren't picked
pick(user, ["id"]).passwordHash;
