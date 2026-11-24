import type { ChatMessage, MessageDraft } from "../domain/chat.js";

/**
 * Recent messages per room. The service layer depends on this interface,
 * not on Redis.
 */
export interface HistoryRepository {
  /** Assigns the next per-room id, stores the message and trims history. Returns the stored message. */
  append(draft: MessageDraft): Promise<ChatMessage>;
  /** The most recent messages of a room, oldest first (at most the configured history size). */
  recent(room: string): Promise<ChatMessage[]>;
  /** Retained messages with id > afterId, oldest first. Used to resume after a disconnect. */
  since(room: string, afterId: number): Promise<ChatMessage[]>;
}
