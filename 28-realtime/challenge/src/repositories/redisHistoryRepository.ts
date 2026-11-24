import type { Redis } from "ioredis";
import type { ChatMessage, MessageDraft } from "../domain/chat.js";
import type { HistoryRepository } from "./historyRepository.js";

export interface RedisHistoryOptions {
  redis: Redis;
  /** Key prefix, e.g. "wl:28:". */
  prefix: string;
  /** Messages kept per room. Default 50. */
  maxMessages?: number;
}

/**
 * TODO(4): recent history per room in Redis.
 *
 * Suggested keys per room (everything MUST start with `prefix`):
 *   <prefix>room:<room>:seq      counter: the last id handed out (INCR)
 *   <prefix>room:<room>:history  list of JSON messages, oldest first
 *
 * append(draft):
 *   - next id = INCR of the room's counter (ids are 1, 2, 3... per room)
 *   - store the message (with its id) at the END of the list
 *   - trim the list so only the newest `maxMessages` remain
 *   - return the stored ChatMessage
 *   These steps must be ATOMIC: with 40 concurrent appends, list order must
 *   equal id order. Separate commands can interleave between clients; a Lua
 *   script (redis.eval) runs as one unit. (Module 17 covered Lua.)
 *
 * recent(room): all retained messages, oldest first ([] if none).
 * since(room, afterId): retained messages with id > afterId, oldest first.
 */
export class RedisHistoryRepository implements HistoryRepository {
  constructor(options: RedisHistoryOptions) {
    // TODO(4)
  }

  async append(draft: MessageDraft): Promise<ChatMessage> {
    throw new Error("Not implemented");
  }

  async recent(room: string): Promise<ChatMessage[]> {
    throw new Error("Not implemented");
  }

  async since(room: string, afterId: number): Promise<ChatMessage[]> {
    throw new Error("Not implemented");
  }
}
