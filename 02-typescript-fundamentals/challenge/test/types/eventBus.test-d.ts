import { expectTypeOf } from "vitest";
import { EventBus } from "../../src/eventBus.js";

type AppEvents = {
  "user:created": { id: string; email: string };
  "order:paid": { orderId: string; cents: number };
  "cache:cleared": undefined;
};

const bus = new EventBus<AppEvents>();

// The handler's payload type is picked by the event name.
bus.on("user:created", (user) => {
  expectTypeOf(user).toEqualTypeOf<{ id: string; email: string }>();
});
bus.once("order:paid", (p) => {
  expectTypeOf(p.cents).toEqualTypeOf<number>();
});

expectTypeOf(bus.on("cache:cleared", () => {})).toEqualTypeOf<() => void>();
expectTypeOf(bus.listenerCount("order:paid")).toEqualTypeOf<number>();

bus.emit("order:paid", { orderId: "o1", cents: 100 });
bus.emit("cache:cleared", undefined);

// @ts-expect-error typo in the event name
bus.emit("user:craeted", { id: "u1", email: "a@b.c" });

// @ts-expect-error wrong payload shape for this event
bus.emit("order:paid", { orderId: "o1", cents: "100" });

// @ts-expect-error missing payload
bus.emit("user:created");

// @ts-expect-error unknown event in on()
bus.on("user:deleted", () => {});

// @ts-expect-error unknown event in listenerCount()
bus.listenerCount("nope");

bus.on("user:created", (user) => {
  // @ts-expect-error the payload has no `cents`
  user.cents;
});
