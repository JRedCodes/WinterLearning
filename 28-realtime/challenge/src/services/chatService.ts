import type { ChatMessage, PresenceChange } from "../domain/chat.js";
import type { MessageBus } from "../bus/messageBus.js";
import type { HistoryRepository } from "../repositories/historyRepository.js";

export interface ChatServiceDeps {
  history: HistoryRepository;
  bus: MessageBus;
  /** Injected so tests can control timestamps. */
  now?: () => number;
}

/**
 * The business operations of the chat, independent of transport.
 * WebSocket handlers and the SSE route both call this; neither talks to Redis.
 *
 * Notice that `post` does NOT deliver to anyone directly. It stores the
 * message and publishes it. Delivery happens when the event comes back from
 * the bus, on every instance, through exactly one code path.
 */
export class ChatService {
  private readonly now: () => number;

  constructor(private readonly deps: ChatServiceDeps) {
    this.now = deps.now ?? Date.now;
  }

  async post(room: string, user: string, text: string): Promise<ChatMessage> {
    const message = await this.deps.history.append({ room, user, text, ts: this.now() });
    await this.deps.bus.publish({ kind: "message", room, message });
    return message;
  }

  async announce(room: string, user: string, change: PresenceChange): Promise<void> {
    await this.deps.bus.publish({ kind: "presence", room, user, change });
  }

  history(room: string): Promise<ChatMessage[]> {
    return this.deps.history.recent(room);
  }

  /** Messages after `lastId` (resume). */
  historySince(room: string, lastId: number): Promise<ChatMessage[]> {
    return this.deps.history.since(room, lastId);
  }
}
