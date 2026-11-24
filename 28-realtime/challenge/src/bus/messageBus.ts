import type { RoomEvent } from "../domain/chat.js";

/**
 * Cross-instance fan-out. Every instance publishes the events that happen on
 * it, and every instance (including the publisher) receives every event.
 *
 * Delivery is at-most-once: an instance that is disconnected when an event is
 * published never sees it. History + message ids are how clients recover.
 */
export interface MessageBus {
  publish(event: RoomEvent): Promise<void>;
  /** Starts receiving. Resolves once the subscription is active, so nothing published afterwards is missed. */
  subscribe(handler: (event: RoomEvent) => void): Promise<void>;
  /** Stops receiving. Does not close the underlying connections (the composition root owns those). */
  close(): Promise<void>;
}
