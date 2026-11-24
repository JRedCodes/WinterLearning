import { describe, expect, it } from "vitest";
import { deepFreeze } from "../src/deepFreeze.js";

describe("deepFreeze (TODO 7)", () => {
  it("returns the same reference", () => {
    const obj = { a: 1 };
    expect(deepFreeze(obj)).toBe(obj);
  });

  it("freezes nested objects and arrays", () => {
    const config = { db: { host: "localhost", ports: [5433, 5434] }, flags: [{ name: "beta" }] };
    deepFreeze(config);
    expect(Object.isFrozen(config)).toBe(true);
    expect(Object.isFrozen(config.db)).toBe(true);
    expect(Object.isFrozen(config.db.ports)).toBe(true);
    expect(Object.isFrozen(config.flags[0])).toBe(true);
  });

  it("makes mutation throw in strict mode (ES modules are always strict)", () => {
    const config = deepFreeze({ db: { host: "localhost" } });
    expect(() => {
      // Reflect.set returns false instead of throwing, so assign through a
      // loosely typed reference to prove the object really is frozen.
      const loose: Record<string, unknown> = config.db;
      loose.host = "evil";
    }).toThrow(TypeError);
  });

  it("handles objects with cycles", () => {
    const a: { name: string; self?: unknown } = { name: "a" };
    a.self = a;
    expect(() => deepFreeze(a)).not.toThrow();
    expect(Object.isFrozen(a)).toBe(true);
  });

  it("leaves primitives alone", () => {
    expect(deepFreeze(42)).toBe(42);
    expect(deepFreeze("hi")).toBe("hi");
    expect(deepFreeze(null)).toBe(null);
  });
});
