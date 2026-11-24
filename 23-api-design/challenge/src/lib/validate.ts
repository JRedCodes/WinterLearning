import type { z } from "zod";
import { ValidationError } from "../domain/errors.js";

/** Parse untrusted input with a zod schema, or throw a ValidationError whose errors use JSON Pointers. */
export function parseInput<S extends z.ZodType>(schema: S, input: unknown, message = "Request validation failed"): z.infer<S> {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new ValidationError(
      message,
      result.error.issues.map((i) => ({
        pointer: "/" + i.path.map((p) => String(p).replace(/~/g, "~0").replace(/\//g, "~1")).join("/"),
        detail: i.message,
      })),
    );
  }
  return result.data;
}
