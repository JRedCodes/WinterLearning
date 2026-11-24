import { describe, expect, it } from "vitest";
import { first } from "../src/first.js";

describe("first (TODO 1)", () => {
  it("returns the first element", () => {
    expect(first([10, 20, 30])).toBe(10);
    expect(first(["only"])).toBe("only");
  });

  it("returns undefined for an empty array instead of throwing", () => {
    expect(first([])).toBeUndefined();
  });

  it("does not mutate the input", () => {
    const items = [1, 2, 3];
    first(items);
    expect(items).toEqual([1, 2, 3]);
  });
});
