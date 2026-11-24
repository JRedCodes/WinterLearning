import type { z } from "zod";

/** HTTP-layer error: the request itself is malformed (400). */
export class RequestValidationError extends Error {
  constructor(public readonly details: { path: string; message: string }[]) {
    super("Request validation failed");
    this.name = "RequestValidationError";
  }
}

export function parseOrThrow<S extends z.ZodType>(schema: S, value: unknown): z.infer<S> {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new RequestValidationError(
      result.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    );
  }
  return result.data;
}
