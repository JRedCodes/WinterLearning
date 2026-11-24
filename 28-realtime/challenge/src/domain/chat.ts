/**
 * Domain types shared by every layer. No Express, no ws, no Redis in here.
 */

/** A chat message as stored in history and sent to clients. */
export interface ChatMessage {
  /** Per-room sequence number assigned by Redis: 1, 2, 3, ... Used for ordering, dedupe and resume. */
  id: number;
  room: string;
  user: string;
  text: string;
  /** Unix epoch milliseconds, set by the server (never trust client clocks). */
  ts: number;
}

/** What a message looks like before history assigns it an id. */
export type MessageDraft = Omit<ChatMessage, "id">;

export type PresenceChange = "join" | "leave";

/**
 * An event that happened in a room. This is what travels over the message bus
 * between server instances, and what the RoomHub fans out to local listeners.
 */
export type RoomEvent =
  | { kind: "message"; room: string; message: ChatMessage }
  | { kind: "presence"; room: string; user: string; change: PresenceChange };

/** Messages a client may send. Validated at the edge by `parseClientMessage`. */
export type ClientMessage =
  | { type: "join"; room: string }
  | { type: "leave"; room: string }
  | { type: "message"; room: string; text: string };

export type ErrorCode = "BAD_JSON" | "INVALID_MESSAGE" | "NOT_IN_ROOM" | "INTERNAL";

/** Messages the server sends over a WebSocket. */
export type ServerMessage =
  | { type: "welcome"; user: string }
  | { type: "joined"; room: string; history: ChatMessage[] }
  | { type: "left"; room: string }
  | { type: "message"; message: ChatMessage }
  | { type: "presence"; room: string; user: string; change: PresenceChange }
  | { type: "error"; code: ErrorCode; message: string };
