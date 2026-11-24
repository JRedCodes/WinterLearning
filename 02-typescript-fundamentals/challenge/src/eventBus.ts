/** A function that receives one event's payload. */
export type Handler<P> = (payload: P) => void;

/**
 * TODO(6): a typed EventBus<Events>
 *
 * Port legacy/eventBus.js so that event names and payloads are checked:
 *
 *   type AppEvents = {
 *     "user:created": { id: string; email: string };
 *     "cache:cleared": undefined;
 *   };
 *   const bus = new EventBus<AppEvents>();
 *   bus.on("user:created", (u) => u.email);     // u is typed
 *   bus.emit("user:craeted", ...);              // compile error: typo
 *
 * 1. Make the class generic: `EventBus<Events extends Record<string, unknown>>`.
 * 2. Make each method generic over `K extends keyof Events` so the event name
 *    picks the payload type: `Events[K]` (an indexed access type).
 * 3. Store handlers without losing that link. A mapped type does it:
 *      { [K in keyof Events]?: Set<Handler<Events[K]>> }
 *    (A Map<string, Set<Handler<unknown>>> loses it and forces casts.)
 *
 * Behavior (same as legacy, plus its bug fixed):
 *  - on(event, handler) subscribes and returns an unsubscribe function;
 *    calling it twice is harmless.
 *  - once(event, handler): runs at most once; also returns an unsubscribe fn.
 *  - emit(event, payload) calls handlers in subscription order. Iterate over a
 *    COPY so a handler that unsubscribes another one mid-emit doesn't skip it.
 *  - listenerCount(event) returns the number of handlers for that event.
 *
 * Spec: test/eventBus.test.ts and test/types/eventBus.test-d.ts.
 */
export class EventBus {
  on(event: string, handler: Handler<unknown>): () => void {
    throw new Error("Not implemented: EventBus.on (TODO 6)");
  }

  once(event: string, handler: Handler<unknown>): () => void {
    throw new Error("Not implemented: EventBus.once (TODO 6)");
  }

  emit(event: string, payload: unknown): void {
    throw new Error("Not implemented: EventBus.emit (TODO 6)");
  }

  listenerCount(event: string): number {
    throw new Error("Not implemented: EventBus.listenerCount (TODO 6)");
  }
}
