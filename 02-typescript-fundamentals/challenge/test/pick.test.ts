import { describe, expect, it } from "vitest";
import { pick } from "../src/pick.js";

describe("pick (TODO 3)", () => {
  const user = { id: "u1", email: "ada@example.com", passwordHash: "x", age: 36 };

  it("returns a new object with only the requested keys", () => {
    const result = pick(user, ["id", "email"]);
    expect(result).toEqual({ id: "u1", email: "ada@example.com" });
    expect(result).not.toHaveProperty("passwordHash");
  });

  it("returns a new object, not the original", () => {
    const result = pick(user, ["id"]);
    expect(result).not.toBe(user);
    expect(user).toHaveProperty("passwordHash"); // input untouched
  });

  it("returns an empty object for no keys", () => {
    expect(pick(user, [])).toEqual({});
  });

  it("keeps optional keys only when they are present on the object", () => {
    const withNick: { name: string; nickname?: string } = { name: "Ada" };
    expect(pick(withNick, ["name", "nickname"])).toEqual({ name: "Ada" });
    expect(Object.keys(pick(withNick, ["name", "nickname"]))).toEqual(["name"]);
  });
});
