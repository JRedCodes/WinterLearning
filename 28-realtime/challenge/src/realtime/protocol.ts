import { z } from "zod";
import type { ClientMessage, ServerMessage } from "../domain/chat.js";

/** Room names: lowercase letters, digits and dashes, 1–32 chars, not starting with a dash. */
export const RoomName = z.string().regex(/^[a-z0-9][a-z0-9-]{0,31}$/, "room must match ^[a-z0-9][a-z0-9-]{0,31}$");

export const MAX_TEXT_LENGTH = 500;

export type ParseResult =
  | { ok: true; message: ClientMessage }
  | { ok: false; code: "BAD_JSON" | "INVALID_MESSAGE"; error: string };

/**
 * TODO(1): validate every frame a client sends.
 *
 * The trust boundary for everything a client sends over the socket. It must
 * NEVER throw: a bad frame from one client must not crash the handler.
 *
 * - Not valid JSON                     → { ok: false, code: "BAD_JSON", error }
 * - Valid JSON but not a ClientMessage → { ok: false, code: "INVALID_MESSAGE", error }
 *   (error: a human-readable description of what's wrong)
 * - Otherwise                          → { ok: true, message }
 *
 * A ClientMessage (see src/domain/chat.ts) is one of:
 *   { type: "join",    room }
 *   { type: "leave",   room }
 *   { type: "message", room, text }
 * where `room` matches RoomName and `text` is trimmed, then 1..MAX_TEXT_LENGTH chars.
 * Unknown extra fields are dropped.
 *
 * Use zod: a discriminated union on "type" and safeParse.
 */
export function parseClientMessage(raw: string): ParseResult {
  throw new Error("Not implemented");
}

/** Server → client encoding. One place, so the wire format can't drift. */
export function serialize(message: ServerMessage): string {
  return JSON.stringify(message);
}
