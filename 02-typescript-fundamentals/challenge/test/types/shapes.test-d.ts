import { expectTypeOf } from "vitest";
import { area, assertNever, type Circle, type Rectangle, type Shape, type Triangle } from "../../src/shapes.js";

// Shape is a union of exactly these three members...
expectTypeOf<Shape>().toEqualTypeOf<Circle | Rectangle | Triangle>();
// ...discriminated by a literal `kind` field.
expectTypeOf<Shape["kind"]>().toEqualTypeOf<"circle" | "rectangle" | "triangle">();
expectTypeOf<Circle>().toHaveProperty("radius").toEqualTypeOf<number>();
expectTypeOf<Rectangle>().toHaveProperty("width").toEqualTypeOf<number>();
expectTypeOf<Triangle>().toHaveProperty("base").toEqualTypeOf<number>();

expectTypeOf(area).parameter(0).toEqualTypeOf<Shape>();
expectTypeOf(area).returns.toEqualTypeOf<number>();
expectTypeOf(assertNever).parameter(0).toBeNever();

// @ts-expect-error a circle has a radius, not a width
area({ kind: "circle", width: 2 });

// @ts-expect-error "hexagon" is not a Shape kind
area({ kind: "hexagon", side: 1 });

// @ts-expect-error nothing (except a value of type never) can be passed to assertNever
assertNever("circle");

// Narrowing: inside each case the shape has that member's type.
export function narrowing(s: Shape) {
  if (s.kind === "rectangle") {
    expectTypeOf(s).toEqualTypeOf<Rectangle>();
  }
}
