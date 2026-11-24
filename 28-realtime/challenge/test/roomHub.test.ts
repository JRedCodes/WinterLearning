import { describe, expect, it, vi } from "vitest";
import type { RoomEvent } from "../src/domain/chat.js";
import { RoomHub } from "../src/realtime/roomHub.js";

const msg = (room: string, id: number): RoomEvent => ({
  kind: "message",
  room,
  message: { id, room, user: "ada", text: `m${id}`, ts: 0 },
});

function recorder() {
  const events: RoomEvent[] = [];
  return { events, deliver: (e: RoomEvent) => void events.push(e) };
}

describe("RoomHub (TODO 2)", () => {
  it("delivers an event only to subscribers of that room", () => {
    const hub = new RoomHub();
    const a = recorder();
    const b = recorder();
    hub.subscribe("general", a);
    hub.subscribe("random", b);
    hub.dispatch(msg("general", 1));
    expect(a.events).toEqual([msg("general", 1)]);
    expect(b.events).toEqual([]);
  });

  it("delivers to every subscriber of a room, in order", () => {
    const hub = new RoomHub();
    const a = recorder();
    const b = recorder();
    hub.subscribe("general", a);
    hub.subscribe("general", b);
    hub.dispatch(msg("general", 1));
    hub.dispatch(msg("general", 2));
    expect(a.events.map((e) => e.kind === "message" && e.message.id)).toEqual([1, 2]);
    expect(b.events.map((e) => e.kind === "message" && e.message.id)).toEqual([1, 2]);
  });

  it("stops delivering after unsubscribe, and unsubscribe is idempotent", () => {
    const hub = new RoomHub();
    const a = recorder();
    const unsubscribe = hub.subscribe("general", a);
    unsubscribe();
    unsubscribe();
    hub.dispatch(msg("general", 1));
    expect(a.events).toEqual([]);
  });

  it("tracks subscriber counts and forgets empty rooms (no leak)", () => {
    const hub = new RoomHub();
    const offA = hub.subscribe("general", recorder());
    const offB = hub.subscribe("general", recorder());
    hub.subscribe("random", recorder());
    expect(hub.subscriberCount("general")).toBe(2);
    expect(hub.roomCount()).toBe(2);
    offA();
    offB();
    expect(hub.subscriberCount("general")).toBe(0);
    expect(hub.roomCount(), "a room with no subscribers left should be removed from the map").toBe(1);
  });

  it("ignores events for rooms nobody here has joined", () => {
    const hub = new RoomHub();
    expect(() => hub.dispatch(msg("empty", 1))).not.toThrow();
    expect(hub.roomCount()).toBe(0);
  });

  it("keeps delivering to others when one subscriber throws, and reports the error", () => {
    const onError = vi.fn();
    const hub = new RoomHub({ onError });
    const good = recorder();
    hub.subscribe("general", {
      deliver: () => {
        throw new Error("socket exploded");
      },
    });
    hub.subscribe("general", good);
    hub.dispatch(msg("general", 1));
    expect(good.events).toHaveLength(1);
    expect(onError).toHaveBeenCalledOnce();
  });

  it("tolerates a subscriber that unsubscribes itself during delivery", () => {
    const hub = new RoomHub();
    const later = recorder();
    // eslint-disable-next-line prefer-const
    let off: () => void = () => {};
    off = hub.subscribe("general", { deliver: () => off() });
    hub.subscribe("general", later);
    hub.dispatch(msg("general", 1));
    expect(later.events).toHaveLength(1);
    expect(hub.subscriberCount("general")).toBe(1);
  });
});
