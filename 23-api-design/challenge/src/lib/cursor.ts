import { ValidationError } from "../domain/errors.js";

/**
 * What a cursor remembers: the keyset position of the last item on the page,
 * plus the sort it belongs to (a cursor from a "-createdAt" listing makes no
 * sense in a "createdAt" listing, so we reject the mix).
 */
export interface CursorPayload {
  createdAt: string;
  id: string;
  sort: string;
}

/**
 * TODO(3): Opaque cursors.
 *
 * encodeCursor(payload)
 *   - JSON-encode the payload and base64url-encode the result.
 *   - Clients must treat the cursor as an opaque string: they should not be able
 *     to read "createdAt" in it at a glance, and we stay free to change the format.
 *
 * decodeCursor(raw)
 *   - reverse the encoding
 *   - ANY problem (not base64url, not JSON, not an object, missing fields, fields
 *     that aren't non-empty strings, createdAt that isn't a valid date) must throw
 *       new ValidationError("Invalid cursor", [{ pointer: "/cursor", detail: "..." }])
 *     so the client gets a 400 problem, never a 500.
 */
export function encodeCursor(_payload: CursorPayload): string {
  throw new Error("Not implemented: TODO(3) encodeCursor");
}

export function decodeCursor(_raw: string): CursorPayload {
  throw new Error("Not implemented: TODO(3) decodeCursor");
}
