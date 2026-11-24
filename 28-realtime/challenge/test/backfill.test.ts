import { describe, expect, it } from "vitest";
import type { ChatMessage, RoomEvent } from "../src/domain/chat.js";
import { subscribeWithBackfill } from "../src/realtime/backfill.js";
import type { Subscriber } from "../src/realtime/roomHub.js";

const m = (id: number): ChatMessage => ({ id, room: "general", user: "ada", text: `m${id}`, ts: id });
const live = (id: number): RoomEvent => ({ kind: "message", room: "general", message: m(id) });
const presence: RoomEvent = { kind: "presence", room: "general", user: "bob", change: "join" };

/** A fake hub that lets the test push events at any moment. */
function fakeHub() {
  const subs = new Set<Subscriber>();
  return {
    subs,
    subscribe(_room: string, s: Subscriber) {
      subs.add(s);
      return () => void subs.delete(s);
    },
    push(e: RoomEvent) {
      for (const s of [...subs]) s.deliver(e);
    },
  };
}

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("subscribeWithBackfill (TODO 6)", () => {
  it("subscribes BEFORE loading history, so nothing published meanwhile is lost", async () => {
    const hub = fakeHub();
    const load = deferred<ChatMessage[]>();
    const log: string[] = [];
    const pending = subscribeWithBackfill({
      hub,
      room: "general",
      loadBackfill: () => load.promise,
      onBackfill: (msgs) => log.push(`backfill:${msgs.map((x) => x.id).join(",")}`),
      onEvent: (e) => log.push(e.kind === "message" ? `live:${e.message.id}` : `presence:${e.user}`),
    });
    expect(hub.subs.size, "must be subscribed while history is still loading").toBe(1);
    hub.push(live(3)); // published while history was loading
    load.resolve([m(1), m(2)]);
    await pending;
    expect(log).toEqual(["backfill:1,2", "live:3"]);
  });

  it("delivers the backfill first, then buffered events, then live events", async () => {
    const hub = fakeHub();
    const load = deferred<ChatMessage[]>();
    const log: string[] = [];
    const pending = subscribeWithBackfill({
      hub,
      room: "general",
      loadBackfill: () => load.promise,
      onBackfill: () => log.push("backfill"),
      onEvent: (e) => log.push(e.kind === "message" ? `live:${e.message.id}` : "presence"),
    });
    hub.push(presence);
    hub.push(live(5));
    expect(log, "nothing may be delivered before the backfill").toEqual([]);
    load.resolve([m(4)]);
    await pending;
    hub.push(live(6));
    expect(log).toEqual(["backfill", "presence", "live:5", "live:6"]);
  });

  it("drops buffered messages that were already part of the backfill (no duplicates)", async () => {
    const hub = fakeHub();
    const load = deferred<ChatMessage[]>();
    const liveIds: number[] = [];
    const pending = subscribeWithBackfill({
      hub,
      room: "general",
      loadBackfill: () => load.promise,
      onBackfill: () => {},
      onEvent: (e) => e.kind === "message" && liveIds.push(e.message.id),
    });
    hub.push(live(2)); // published and stored before the history read: it IS in the backfill
    hub.push(live(3));
    load.resolve([m(1), m(2)]);
    await pending;
    hub.push(live(3)); // a duplicate delivery later on is dropped too
    hub.push(live(4));
    expect(liveIds).toEqual([3, 4]);
  });

  it("returns an unsubscribe function", async () => {
    const hub = fakeHub();
    const events: RoomEvent[] = [];
    const off = await subscribeWithBackfill({
      hub,
      room: "general",
      loadBackfill: async () => [],
      onBackfill: () => {},
      onEvent: (e) => events.push(e),
    });
    off();
    hub.push(live(1));
    expect(events).toEqual([]);
    expect(hub.subs.size).toBe(0);
  });

  it("unsubscribes and rethrows when loading the backfill fails", async () => {
    const hub = fakeHub();
    await expect(
      subscribeWithBackfill({
        hub,
        room: "general",
        loadBackfill: async () => {
          throw new Error("redis down");
        },
        onBackfill: () => {},
        onEvent: () => {},
      }),
    ).rejects.toThrow("redis down");
    expect(hub.subs.size, "a failed join must not leave a subscriber behind").toBe(0);
  });
});
