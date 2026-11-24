// A tiny pub/sub bus.
//   const bus = new EventBus();
//   const off = bus.on("user:created", (user) => sendWelcome(user.email));
//   bus.emit("user:created", { id: "u1", email: "a@b.c" });
//   off();
// NOTE: nothing stopped `bus.emit("user:craeted", ...)` (typo, nobody listens)
// or emitting a payload with the wrong shape.
export class EventBus {
  constructor() {
    this.handlers = {};
  }

  on(event, handler) {
    (this.handlers[event] ||= new Set()).add(handler);
    return () => this.handlers[event].delete(handler);
  }

  once(event, handler) {
    const off = this.on(event, (payload) => {
      off();
      handler(payload);
    });
    return off;
  }

  emit(event, payload) {
    // NOTE: iterating the live Set means a handler that unsubscribes during
    // emit can change what runs next. Iterate over a copy.
    for (const handler of this.handlers[event] || []) handler(payload);
  }

  listenerCount(event) {
    return this.handlers[event] ? this.handlers[event].size : 0;
  }
}
