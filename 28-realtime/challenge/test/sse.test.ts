import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Redis } from "ioredis";
import type { Instance } from "../src/instance.js";
import { start } from "./helpers/instances.js";
import { deletePrefix, testRedis, uniquePrefix } from "./helpers/redis.js";
import { SseStream } from "./helpers/sse.js";
import { eventually } from "./helpers/wait.js";
import { TestClient } from "./helpers/wsClient.js";

describe("SSE read-only room feed: GET /rooms/:room/events (TODO 8)", () => {
  let redis: Redis;
  let prefix: string;
  let a: Instance;
  let b: Instance;
  const streams: SseStream[] = [];
  const clients: TestClient[] = [];

  async function open(instance: Instance, room: string, headers: Record<string, string> = {}, query = "") {
    const stream = await SseStream.open(`${instance.httpUrl}/rooms/${room}/events${query}`, headers);
    streams.push(stream);
    return stream;
  }

  beforeAll(async () => {
    redis = await testRedis();
  });
  afterAll(() => redis.quit());
  beforeEach(async () => {
    prefix = uniquePrefix();
    a = await start(prefix);
    b = await start(prefix, { sseKeepAliveMs: 100 });
  });
  afterEach(async () => {
    for (const s of streams.splice(0)) s.close();
    await Promise.all(clients.splice(0).map((c) => c.close()));
    await Promise.all([a?.close(), b?.close()]);
    await deletePrefix(redis, prefix);
  });

  it("responds 200 with SSE headers", async () => {
    const stream = await open(b, "general");
    expect(stream.status).toBe(200);
    expect(stream.headers.get("content-type")).toMatch(/^text\/event-stream/);
    expect(stream.headers.get("cache-control")).toMatch(/no-cache/);
  });

  it("rejects an invalid room name with a 400 JSON error", async () => {
    const res = await fetch(`${b.httpUrl}/rooms/Bad%20Room/events`);
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: { code: "INVALID_ROOM" } });
  });

  it("replays recent history as `message` events with `id:` lines", async () => {
    await a.chat.post("general", "ada", "one");
    await a.chat.post("general", "ada", "two");
    const stream = await open(b, "general");
    const first = await stream.next((e) => e.event === "message", "first history message");
    const second = await stream.next((e) => e.event === "message", "second history message");
    expect(first.id).toBe("1");
    expect(JSON.parse(first.data ?? "")).toMatchObject({ id: 1, user: "ada", text: "one", room: "general" });
    expect(second.id).toBe("2");
  });

  it("streams live messages posted over WebSocket on the other instance", async () => {
    const stream = await open(b, "general");
    const alice = await TestClient.connect(a.wsUrl, "alice");
    clients.push(alice);
    alice.send({ type: "join", room: "general" });
    await alice.nextOfType("joined");
    alice.send({ type: "message", room: "general", text: "live!" });
    const event = await stream.next((e) => e.event === "message", "the live message");
    expect(JSON.parse(event.data ?? "")).toMatchObject({ user: "alice", text: "live!" });
  });

  it("streams presence events without an id (so Last-Event-ID keeps pointing at messages)", async () => {
    const stream = await open(b, "general");
    await a.chat.announce("general", "zoe", "join");
    const event = await stream.next((e) => e.event === "presence", "a presence event");
    expect(JSON.parse(event.data ?? "")).toEqual({ room: "general", user: "zoe", change: "join" });
    expect(event.id).toBeUndefined();
  });

  it("resumes from the Last-Event-ID header: only newer messages are replayed", async () => {
    for (const text of ["m1", "m2", "m3", "m4"]) await a.chat.post("general", "ada", text);
    const stream = await open(b, "general", { "Last-Event-ID": "2" });
    await stream.next((e) => e.event === "message" && e.id === "4", "message 4");
    expect(stream.messages().map((m) => m.id)).toEqual([3, 4]);
  });

  it("also accepts ?lastEventId= for the first connection", async () => {
    for (const text of ["m1", "m2", "m3"]) await a.chat.post("general", "ada", text);
    const stream = await open(b, "general", {}, "?lastEventId=1");
    await stream.next((e) => e.event === "message" && e.id === "3", "message 3");
    expect(stream.messages().map((m) => m.id)).toEqual([2, 3]);
  });

  it("sends `: keep-alive` comments so idle proxies don't cut the stream", async () => {
    const stream = await open(b, "quiet");
    const event = await stream.next((e) => e.comments.length > 0, "a keep-alive comment", 1_000);
    expect(event.comments[0]).toMatch(/keep-alive/);
  });

  it("unsubscribes from the hub when the client disconnects", async () => {
    const stream = await open(b, "general");
    await eventually(() => b.hub.subscriberCount("general") === 1, "the stream to be subscribed");
    stream.close();
    await eventually(() => b.hub.subscriberCount("general") === 0, "the subscription to be removed after disconnect");
  });

  it("serves a JSON snapshot at GET /rooms/:room/history", async () => {
    await a.chat.post("general", "ada", "snap");
    const res = await fetch(`${b.httpUrl}/rooms/general/history`);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ data: [{ id: 1, text: "snap" }] });
  });
});
