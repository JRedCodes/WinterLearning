import type { ChatMessage, RoomEvent } from "../domain/chat.js";
import type { RoomHub } from "./roomHub.js";

export interface BackfillOptions {
  /** Only `subscribe` is needed, so tests can pass a tiny fake. */
  hub: Pick<RoomHub, "subscribe">;
  room: string;
  /** Loads the messages the client missed (full recent history, or "since id N"). */
  loadBackfill: () => Promise<ChatMessage[]>;
  /** Receives the backfill once, before any live event. */
  onBackfill: (messages: ChatMessage[]) => void;
  /** Receives live events, in order, with already-seen messages removed. */
  onEvent: (event: RoomEvent) => void;
}

/**
 * TODO(6): join a room's live feed WITHOUT a gap and WITHOUT duplicates.
 *
 * "Load history, then subscribe" loses anything published between the two
 * steps. Instead:
 *   1. subscribe to the hub FIRST, buffering events that arrive meanwhile
 *   2. await loadBackfill(); call onBackfill(messages)
 *   3. flush the buffer through onEvent, then deliver live events directly
 *   4. never pass a message event whose id is <= the highest id already
 *      delivered (backfill or live). Presence events always pass.
 *
 * Resolve with the hub's unsubscribe function. If loadBackfill rejects,
 * unsubscribe and rethrow.
 */
export async function subscribeWithBackfill(options: BackfillOptions): Promise<() => void> {
  throw new Error("Not implemented");
}
