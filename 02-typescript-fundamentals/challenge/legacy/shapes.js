// Shapes are plain objects with a `kind` field:
//   { kind: "circle", radius }
//   { kind: "rectangle", width, height }
//   { kind: "triangle", base, height }
// NOTE: when someone added "triangle" to the app, they forgot to update this
// function. It returned undefined for triangles and the invoice showed NaN.
export function area(shape) {
  switch (shape.kind) {
    case "circle":
      return Math.PI * shape.radius ** 2;
    case "rectangle":
      return shape.width * shape.height;
  }
}
