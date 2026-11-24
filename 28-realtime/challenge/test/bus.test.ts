import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { Redis } from "ioredis";
import type { RoomEvent } from "../src/domain/chat.js";
import { RedisMessageBus } from "../src/bus/redisMessageBus.js";
import { testRedis, uniquePrefix } from "./helpers/redis.js";
import { eventually, sleep } from "./helpers/wait.js";

const event = (id: number, room = "general"): RoomEvent => ({
  kind: "message",
  room,
  message: { id, room, user: "ada", text: `m${id}`, ts: 0 },
});

describe("RedisMessageBus (TODO 5)", () => {
  const connections: Redis[] = [];
  const buses: RedisMessageBus[] = [];

  async function newBus(channel: string, onError: (err: unknown) => void = () => {}) {
    const publisher = await testRedis();
    const subscriber = await testRedis();
    connections.push(publisher, subscriber);
    const bus = new RedisMessageBus({ publisher, subscriber, channel, onError });
    buses.push(bus);
    return { bus, publisher };
  }

  let raw: Redis;
  beforeAll(async () => {
    raw = await testRedis();
  });
  afterEach(async () => {
    await Promise.all(buses.splice(0).map((b) => b.close()));
    await Promise.all(connections.splice(0).map((c) => c.quit()));
  });
  afterAll(() => raw.quit());

  it("delivers a published event to every subscribed bus, including the publisher's own", async () => {
    const channel = `${uniquePrefix()}events`;
    const a = await newBus(channel);
    const b = await newBus(channel);
    const gotA: RoomEvent[] = [];
    const gotB: RoomEvent[] = [];
    await a.bus.subscribe((e) => gotA.push(e));
    await b.bus.subscribe((e) => gotB.push(e));

    await a.bus.publish(event(1));
    await eventually(() => gotA.length === 1 && gotB.length === 1, "both buses to receive the event");
    expect(gotA[0]).toEqual(event(1));
    expect(gotB[0]).toEqual(event(1));
  });

  it("preserves publish order", async () => {
    const channel = `${uniquePrefix()}events`;
    const a = await newBus(channel);
    const got: number[] = [];
    await a.bus.subscribe((e) => e.kind === "message" && got.push(e.message.id));
    for (let i = 1; i <= 20; i++) await a.bus.publish(event(i));
    await eventually(() => got.length === 20, "20 events");
    expect(got).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
  });

  it("only hears its own channel (prefixes isolate environments)", async () => {
    const a = await newBus(`${uniquePrefix()}events`);
    const b = await newBus(`${uniquePrefix()}events`);
    const gotB: RoomEvent[] = [];
    await b.bus.subscribe((e) => gotB.push(e));
    await a.bus.publish(event(1));
    await sleep(150);
    expect(gotB).toEqual([]);
  });

  it("survives a malformed payload on the channel and keeps delivering", async () => {
    const channel = `${uniquePrefix()}events`;
    const onError = vi.fn();
    const a = await newBus(channel, onError);
    const got: RoomEvent[] = [];
    await a.bus.subscribe((e) => got.push(e));
    await raw.publish(channel, "this is not json");
    await raw.publish(channel, JSON.stringify({ hello: "world" }));
    await a.bus.publish(event(7));
    await eventually(() => got.length === 1, "the valid event after the junk");
    expect(got[0]).toEqual(event(7));
    expect(onError).toHaveBeenCalledTimes(2);
  });

  it("stops delivering after close()", async () => {
    const channel = `${uniquePrefix()}events`;
    const a = await newBus(channel);
    const got: RoomEvent[] = [];
    await a.bus.subscribe((e) => got.push(e));
    await a.bus.close();
    await raw.publish(channel, JSON.stringify(event(1)));
    await sleep(150);
    expect(got).toEqual([]);
  });

  it("subscribe() resolves only once the subscription is live", async () => {
    const channel = `${uniquePrefix()}events`;
    const a = await newBus(channel);
    const got: RoomEvent[] = [];
    await a.bus.subscribe((e) => got.push(e));
    // Published immediately after subscribe() resolved: must not be missed.
    await raw.publish(channel, JSON.stringify(event(1)));
    await eventually(() => got.length === 1, "the event published right after subscribe()");
  });
});
