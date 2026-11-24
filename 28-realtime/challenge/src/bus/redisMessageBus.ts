import type { Redis } from "ioredis";
import type { RoomEvent } from "../domain/chat.js";
import type { MessageBus } from "./messageBus.js";

export interface RedisMessageBusOptions {
  /** A normal connection, used for PUBLISH. */
  publisher: Redis;
  /** A dedicated connection: once it SUBSCRIBEs it can't run other commands. */
  subscriber: Redis;
  /** The pub/sub channel, e.g. "wl:28:events". */
  channel: string;
  /** Called for payloads that aren't valid events. Defaults to console.error. */
  onError?: (err: unknown) => void;
}

/**
 * TODO(5): MessageBus on Redis pub/sub. One channel, events as JSON.
 *
 * - publish(event): PUBLISH the JSON on the channel.
 * - subscribe(handler): remember the handler, listen for the subscriber
 *   connection's "message" events, and SUBSCRIBE. Resolve only after Redis
 *   has confirmed the subscription (ioredis' subscribe() promise does that).
 * - Ignore messages from other channels. A payload that isn't JSON, or isn't
 *   shaped like a RoomEvent (needs kind "message" | "presence" and a string
 *   room), goes to onError and must not stop later events.
 * - close(): stop calling handlers, remove your listener, UNSUBSCRIBE.
 *   Don't quit the connections; the composition root owns them.
 */
export class RedisMessageBus implements MessageBus {
  constructor(private readonly options: RedisMessageBusOptions) {}

  async publish(event: RoomEvent): Promise<void> {
    throw new Error("Not implemented");
  }

  async subscribe(handler: (event: RoomEvent) => void): Promise<void> {
    throw new Error("Not implemented");
  }

  async close(): Promise<void> {
    // TODO(5)
  }
}
