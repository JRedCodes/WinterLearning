/**
 * TODO(4): Shape: a discriminated union with an exhaustive switch
 *
 * Port legacy/shapes.js, and fix the bug it shipped with (triangles → NaN).
 *
 * 1. Export three interfaces, each with a literal `kind` field (the discriminant):
 *      Circle     { kind: "circle";    radius: number }
 *      Rectangle  { kind: "rectangle"; width: number; height: number }
 *      Triangle   { kind: "triangle";  base: number;  height: number }
 *    (Making the fields `readonly` is a good habit, and the tests allow it.)
 * 2. Export `type Shape` as the union of the three.
 * 3. Export `assertNever(value: never): never` that throws an Error whose
 *    message includes the unexpected value (JSON.stringify it).
 * 4. Implement `area(shape: Shape): number` with a `switch (shape.kind)` and a
 *    `default:` branch that calls `assertNever(shape)`. Then try deleting the
 *    triangle case and read the compiler error. That error is the point.
 *
 *    triangle area = base * height / 2
 *
 * Spec: test/shapes.test.ts and test/types/shapes.test-d.ts.
 */

// TODO(4): replace this placeholder with the union of Circle | Rectangle | Triangle.
export type Shape = unknown;

export function assertNever(value: unknown): never {
  throw new Error("Not implemented: assertNever (TODO 4)");
}

export function area(shape: Shape): number {
  throw new Error("Not implemented: area (TODO 4)");
}
