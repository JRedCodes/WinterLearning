import { describe, expect, it } from "vitest";
import { groupBy } from "../src/groupBy.js";

interface User {
  name: string;
  role: "admin" | "member";
  age: number;
}

const users: User[] = [
  { name: "Ada", role: "admin", age: 36 },
  { name: "Linus", role: "member", age: 28 },
  { name: "Grace", role: "admin", age: 45 },
  { name: "Ken", role: "member", age: 28 },
];

describe("groupBy (TODO 2)", () => {
  it("groups items by a string key, preserving input order inside each group", () => {
    const groups = groupBy(users, (u) => u.role);
    expect(groups.admin?.map((u) => u.name)).toEqual(["Ada", "Grace"]);
    expect(groups.member?.map((u) => u.name)).toEqual(["Linus", "Ken"]);
  });

  it("supports number keys", () => {
    const byAge = groupBy(users, (u) => u.age);
    expect(byAge[28]?.map((u) => u.name)).toEqual(["Linus", "Ken"]);
    expect(Object.keys(byAge).sort()).toEqual(["28", "36", "45"]);
  });

  it("omits groups that have no members", () => {
    const groups = groupBy(
      users.filter((u) => u.role === "member"),
      (u) => u.role,
    );
    expect(groups).not.toHaveProperty("admin");
  });

  it("returns an empty object for an empty list", () => {
    expect(groupBy([] as User[], (u) => u.role)).toEqual({});
  });

  it("does not mutate the input", () => {
    const copy = structuredClone(users);
    groupBy(users, (u) => u.role);
    expect(users).toEqual(copy);
  });
});
