import type { RoomEvent } from "../domain/chat.js";

/** Anything that wants room events on THIS instance: a WebSocket connection, an SSE stream, a test. */
export interface Subscriber {
  deliver(event: RoomEvent): void;
}

export interface RoomHubOptions {
  /** Called when a subscriber throws. Defaults to console.error. */
  onError?: (err: unknown) => void;
}

/**
 * Local, in-memory fan-out: room name → the subscribers on this instance.
 *
 * The hub knows nothing about Redis or sockets. Events arrive from the bus
 * (so they include messages posted on OTHER instances) and the hub hands each
 * one to the local subscribers of that room.
 *
 * TODO(2): implement the hub.
 * - subscribe(room, subscriber) adds it and returns an unsubscribe function
 *   that is safe to call more than once.
 * - When a room's last subscriber leaves, remove the room from your map
 *   (otherwise every room ever used leaks an empty Set).
 * - dispatch(event) calls deliver() on every subscriber of event.room. If one
 *   subscriber throws, report it with onError and keep going. A subscriber
 *   may unsubscribe itself while being delivered to.
 */
export class RoomHub {
  constructor(options: RoomHubOptions = {}) {
    // TODO(2)
  }

  /** Adds a subscriber to a room. Returns an idempotent unsubscribe function. */
  subscribe(room: string, subscriber: Subscriber): () => void {
    throw new Error("Not implemented");
  }

  /** Delivers an event to every local subscriber of `event.room`. One bad subscriber can't block the rest. */
  dispatch(event: RoomEvent): void {
    throw new Error("Not implemented");
  }

  subscriberCount(room: string): number {
    throw new Error("Not implemented");
  }

  /** Number of rooms with at least one local subscriber. */
  roomCount(): number {
    throw new Error("Not implemented");
  }
}
