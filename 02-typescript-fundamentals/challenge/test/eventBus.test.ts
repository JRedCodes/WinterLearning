import { describe, expect, it, vi } from "vitest";
import { EventBus } from "../src/eventBus.js";

type AppEvents = {
  "user:created": { id: string; email: string };
  "order:paid": { orderId: string; cents: number };
  "cache:cleared": undefined;
};

describe("EventBus (TODO 6)", () => {
  it("delivers a payload to every handler of that event, in subscription order", () => {
    const bus = new EventBus<AppEvents>();
    const calls: string[] = [];
    bus.on("user:created", (u) => calls.push(`a:${u.email}`));
    bus.on("user:created", (u) => calls.push(`b:${u.id}`));
    bus.emit("user:created", { id: "u1", email: "ada@example.com" });
    expect(calls).toEqual(["a:ada@example.com", "b:u1"]);
  });

  it("only calls handlers of the emitted event", () => {
    const bus = new EventBus<AppEvents>();
    const onPaid = vi.fn();
    bus.on("order:paid", onPaid);
    bus.emit("user:created", { id: "u1", email: "x@y.z" });
    expect(onPaid).not.toHaveBeenCalled();
  });

  it("emitting an event nobody listens to is a no-op", () => {
    const bus = new EventBus<AppEvents>();
    expect(() => bus.emit("cache:cleared", undefined)).not.toThrow();
  });

  it("on() returns an unsubscribe function", () => {
    const bus = new EventBus<AppEvents>();
    const handler = vi.fn();
    const off = bus.on("order:paid", handler);
    bus.emit("order:paid", { orderId: "o1", cents: 100 });
    off();
    bus.emit("order:paid", { orderId: "o2", cents: 200 });
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith({ orderId: "o1", cents: 100 });
  });

  it("calling unsubscribe twice is harmless", () => {
    const bus = new EventBus<AppEvents>();
    const off = bus.on("cache:cleared", () => {});
    off();
    expect(() => off()).not.toThrow();
    expect(bus.listenerCount("cache:cleared")).toBe(0);
  });

  it("once() handlers run at most once", () => {
    const bus = new EventBus<AppEvents>();
    const handler = vi.fn();
    bus.once("cache:cleared", handler);
    bus.emit("cache:cleared", undefined);
    bus.emit("cache:cleared", undefined);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(bus.listenerCount("cache:cleared")).toBe(0);
  });

  it("once() returns an unsubscribe function that works before the event fires", () => {
    const bus = new EventBus<AppEvents>();
    const handler = vi.fn();
    const off = bus.once("cache:cleared", handler);
    off();
    bus.emit("cache:cleared", undefined);
    expect(handler).not.toHaveBeenCalled();
  });

  it("a handler that unsubscribes another handler during emit does not skip it for that emit", () => {
    const bus = new EventBus<AppEvents>();
    const calls: string[] = [];
    let offSecond = () => {};
    bus.on("cache:cleared", () => {
      calls.push("first");
      offSecond();
    });
    offSecond = bus.on("cache:cleared", () => calls.push("second"));

    bus.emit("cache:cleared", undefined);
    expect(calls).toEqual(["first", "second"]);

    bus.emit("cache:cleared", undefined);
    expect(calls).toEqual(["first", "second", "first"]);
  });

  it("listenerCount() counts handlers per event", () => {
    const bus = new EventBus<AppEvents>();
    expect(bus.listenerCount("user:created")).toBe(0);
    bus.on("user:created", () => {});
    bus.on("user:created", () => {});
    bus.on("order:paid", () => {});
    expect(bus.listenerCount("user:created")).toBe(2);
    expect(bus.listenerCount("order:paid")).toBe(1);
  });

  it("two buses do not share handlers", () => {
    const a = new EventBus<AppEvents>();
    const b = new EventBus<AppEvents>();
    const handler = vi.fn();
    a.on("cache:cleared", handler);
    b.emit("cache:cleared", undefined);
    expect(handler).not.toHaveBeenCalled();
  });
});
