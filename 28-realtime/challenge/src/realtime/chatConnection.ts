import type { RoomEvent, ServerMessage } from "../domain/chat.js";
import type { ChatService } from "../services/chatService.js";
import { serialize } from "./protocol.js";
import type { RoomHub } from "./roomHub.js";
import { safeSend, type SendableSocket } from "./send.js";

export interface ChatConnectionDeps {
  chat: ChatService;
  hub: RoomHub;
  maxBufferedBytes: number;
  onError?: (err: unknown) => void;
}

/**
 * One authenticated WebSocket client. Owns the protocol for that client:
 * which rooms it has joined, what each frame means, and cleanup on close.
 *
 * Knows nothing about HTTP upgrades or heartbeats; ChatServer does that.
 *
 * TODO(7): implement receive() and close(). The protocol:
 *
 *   client → { type: "join", room }
 *     First join: subscribe to the room with subscribeWithBackfill (TODO 6),
 *     using chat.history(room) as the backfill. Send
 *       { type: "joined", room, history }
 *     then forward live events as { type: "message", message } or
 *       { type: "presence", room, user, change } (see toServerMessage below),
 *     then chat.announce(room, user, "join").
 *     Joining a room you're already in: just send "joined" again (no second subscription).
 *
 *   client → { type: "leave", room }
 *     Unsubscribe, send { type: "left", room }, announce "leave".
 *     Not in the room → error NOT_IN_ROOM.
 *
 *   client → { type: "message", room, text }
 *     Not in the room → error NOT_IN_ROOM (store nothing).
 *     Otherwise chat.post(room, user, text). Do NOT send anything back
 *     directly: the message comes back to everyone (sender included) via the
 *     bus → hub → your subscriber. That echo is the sender's ack.
 *
 *   Bad frames → { type: "error", code: "BAD_JSON" | "INVALID_MESSAGE", message }
 *   (use parseClientMessage from TODO 1). The connection stays open.
 *   Unexpected failures → onError + { type: "error", code: "INTERNAL", ... }.
 *
 * Ordering: handlers are async. If a "join" and a "message" arrive
 * back-to-back they must be processed in that order, so handle frames one
 * at a time per connection (hint: a promise chain).
 *
 * close(): called once when the socket closes. Unsubscribe from every room
 * and announce "leave" in each. Safe to call twice.
 */
export class ChatConnection {
  private readonly onError: (err: unknown) => void;

  constructor(
    private readonly socket: SendableSocket,
    readonly user: string,
    private readonly deps: ChatConnectionDeps,
  ) {
    this.onError = deps.onError ?? ((err) => console.error("chat connection error", err));
  }

  start(): void {
    this.send({ type: "welcome", user: this.user });
  }

  /** Called for every text frame, in arrival order. */
  receive(raw: string): Promise<void> {
    throw new Error("Not implemented");
  }

  /** Called once when the socket closes (cleanly or not). Leaves every room. */
  async close(): Promise<void> {
    // TODO(7)
  }

  private send(message: ServerMessage): void {
    safeSend(this.socket, serialize(message), this.deps.maxBufferedBytes);
  }
}

export function toServerMessage(event: RoomEvent): ServerMessage {
  return event.kind === "message"
    ? { type: "message", message: event.message }
    : { type: "presence", room: event.room, user: event.user, change: event.change };
}
