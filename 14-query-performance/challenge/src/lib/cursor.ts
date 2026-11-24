import { z } from "zod";
import { InvalidCursorError } from "../domain/errors.js";

/**
 * Cursors are opaque to clients: base64url-encoded JSON. Clients must pass
 * them back unchanged; we validate them with a schema on the way in.
 */
export function encodeCursor(payload: unknown): string {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

export function decodeCursor<T>(cursor: string, schema: z.ZodType<T>): T {
  let json: unknown;
  try {
    json = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
  } catch {
    throw new InvalidCursorError();
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) throw new InvalidCursorError();
  return parsed.data;
}
