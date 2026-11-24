import { describe, expect, it } from "vitest";
import { area, assertNever } from "../src/shapes.js";

describe("area (TODO 4)", () => {
  it("computes a circle's area", () => {
    expect(area({ kind: "circle", radius: 2 })).toBeCloseTo(Math.PI * 4);
  });

  it("computes a rectangle's area", () => {
    expect(area({ kind: "rectangle", width: 3, height: 4 })).toBe(12);
  });

  it("computes a triangle's area (the case the legacy code forgot)", () => {
    expect(area({ kind: "triangle", base: 10, height: 3 })).toBe(15);
  });
});

describe("assertNever (TODO 4)", () => {
  it("throws when it is reached at runtime (e.g. bad data from an API)", () => {
    // At compile time nothing can be passed to assertNever. At runtime, data
    // that lies about its type can still get there, so it must throw.
    const fromTheWire = JSON.parse('{"kind":"hexagon"}') as never;
    expect(() => assertNever(fromTheWire)).toThrow(/hexagon/);
  });
});
