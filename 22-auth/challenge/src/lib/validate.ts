import type { z } from "zod";
import { ValidationError } from "../domain/errors.js";

/** Parse untrusted input with a zod schema, or throw a ValidationError with field details. */
export function parseInput<S extends z.ZodType>(schema: S, input: unknown): z.infer<S> {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new ValidationError(
      "Request validation failed",
      result.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    );
  }
  return result.data;
}
