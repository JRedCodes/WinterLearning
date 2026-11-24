import type { z } from "zod";
import { HttpError } from "./httpError.js";

/** Parses untrusted input or throws a 400 with field-level details. */
export function parse<S extends z.ZodType>(schema: S, input: unknown): z.infer<S> {
  const result = schema.safeParse(input);
  if (!result.success) {
    const details = result.error.issues.map((i) => ({ path: i.path.join("."), message: i.message }));
    throw new HttpError(400, "VALIDATION_ERROR", "Request is invalid", details);
  }
  return result.data;
}
