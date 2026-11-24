import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Redis } from "ioredis";
import type { Instance } from "../src/instance.js";
import { start, tokenFor } from "./helpers/instances.js";
import { deletePrefix, testRedis, uniquePrefix } from "./helpers/redis.js";
import { eventually, sleep } from "./helpers/wait.js";
import { TestClient } from "./helpers/wsClient.js";

/**
 * Two server instances that share nothing but Redis, like two pods behind a
 * load balancer. Clients connect to different instances on purpose.
 */
describe("chat over WebSockets across two instances (TODO 7)", () => {
  let redis: Redis;
  let prefix: string;
  let a: Instance;
  let b: Instance;
  const clients: TestClient[] = [];

  async function connect(instance: Instance, user: string) {
    const client = await TestClient.connect(instance.wsUrl, user);
    clients.push(client);
    await client.nextOfType("welcome");
    return client;
  }

  async function joined(client: TestClient, room: string) {
    client.send({ type: "join", room });
    return client.nextOfType("joined", (m) => m.room === room);
  }

  beforeAll(async () => {
    redis = await testRedis();
  });
  afterAll(() => redis.quit());
  beforeEach(async () => {
    prefix = uniquePrefix();
    a = await start(prefix);
    b = await start(prefix);
  });
  afterEach(async () => {
    await Promise.all(clients.splice(0).map((c) => c.close()));
    await Promise.all([a?.close(), b?.close()]);
    await deletePrefix(redis, prefix);
  });

  describe("authentication on upgrade", () => {
    it("rejects a connection without a token with HTTP 401", async () => {
      expect(await TestClient.rejectionStatus(a.wsUrl)).toBe(401);
    });

    it("rejects a forged token with HTTP 401", async () => {
      const forged = tokenFor("alice").replace(/.$/, (c) => (c === "A" ? "B" : "A"));
      expect(await TestClient.rejectionStatus(`${a.wsUrl}?token=${forged}`)).toBe(401);
    });

    it("rejects upgrades on other paths with HTTP 404", async () => {
      const url = a.wsUrl.replace(/\/ws$/, "/nope") + `?token=${tokenFor("alice")}`;
      expect(await TestClient.rejectionStatus(url)).toBe(404);
    });

    it("greets an authenticated client with its username", async () => {
      const client = await TestClient.connect(a.wsUrl, "alice");
      clients.push(client);
      expect(await client.nextOfType("welcome")).toEqual({ type: "welcome", user: "alice" });
    });
  });

  describe("rooms and messages", () => {
    it("answers join with the room's history (empty for a new room)", async () => {
      const alice = await connect(a, "alice");
      expect(await joined(alice, "general")).toEqual({ type: "joined", room: "general", history: [] });
    });

    it("delivers a message to members on the OTHER instance, and echoes it to the sender", async () => {
      const alice = await connect(a, "alice");
      const bob = await connect(b, "bob");
      await joined(alice, "general");
      await joined(bob, "general");

      alice.send({ type: "message", room: "general", text: "  hi bob  " });

      const atBob = await bob.nextOfType("message");
      expect(atBob.message).toMatchObject({ id: 1, room: "general", user: "alice", text: "hi bob" });
      expect(atBob.message.ts).toEqual(expect.any(Number));
      const echo = await alice.nextOfType("message");
      expect(echo.message, "the sender gets its own message back (with id) as an ack").toEqual(atBob.message);
    });

    it("does not leak messages into other rooms", async () => {
      const alice = await connect(a, "alice");
      const carol = await connect(b, "carol");
      await joined(alice, "general");
      await joined(carol, "random");
      alice.send({ type: "message", room: "general", text: "general only" });
      await alice.nextOfType("message");
      await carol.expectNone((m) => m.type === "message", "message from another room");
    });

    it("processes a join and a message sent back-to-back in order", async () => {
      const alice = await connect(a, "alice");
      // No await between the two frames: the server must not handle them concurrently.
      alice.send({ type: "join", room: "general" });
      alice.send({ type: "message", room: "general", text: "first!" });
      const echo = await alice.nextOfType("message");
      expect(echo.message.text).toBe("first!");
      await alice.expectNone((m) => m.type === "error", "error", 100);
    });

    it("sends history on join, oldest first, from either instance", async () => {
      const alice = await connect(a, "alice");
      await joined(alice, "general");
      for (const text of ["one", "two", "three"]) {
        alice.send({ type: "message", room: "general", text });
        await alice.nextOfType("message", (m) => m.message.text === text);
      }
      const dave = await connect(b, "dave");
      const { history } = await joined(dave, "general");
      expect(history.map((m) => [m.id, m.text])).toEqual([
        [1, "one"],
        [2, "two"],
        [3, "three"],
      ]);
    });

    it("keeps only the last 50 messages of a room", async () => {
      for (let i = 1; i <= 55; i++) await a.chat.post("busy", "bot", `n${i}`);
      const dave = await connect(b, "dave");
      const { history } = await joined(dave, "busy");
      expect(history).toHaveLength(50);
      expect(history[0]?.id).toBe(6);
      expect(history.at(-1)?.id).toBe(55);
    });

    it("stops delivering a room after leave", async () => {
      const alice = await connect(a, "alice");
      const bob = await connect(b, "bob");
      await joined(alice, "general");
      await joined(bob, "general");
      bob.send({ type: "leave", room: "general" });
      expect(await bob.nextOfType("left")).toEqual({ type: "left", room: "general" });
      alice.send({ type: "message", room: "general", text: "anyone?" });
      await alice.nextOfType("message");
      await bob.expectNone((m) => m.type === "message", "message after leaving");
    });
  });

  describe("errors (the connection stays open)", () => {
    it("answers invalid JSON with BAD_JSON and keeps working", async () => {
      const alice = await connect(a, "alice");
      alice.send("{not json");
      expect(await alice.nextOfType("error")).toMatchObject({ type: "error", code: "BAD_JSON" });
      expect((await joined(alice, "general")).room).toBe("general");
    });

    it("answers schema violations with INVALID_MESSAGE", async () => {
      const alice = await connect(a, "alice");
      alice.send({ type: "join", room: "NOT VALID" });
      expect(await alice.nextOfType("error")).toMatchObject({ code: "INVALID_MESSAGE" });
      alice.send({ type: "dance" });
      expect(await alice.nextOfType("error")).toMatchObject({ code: "INVALID_MESSAGE" });
    });

    it("refuses to post to or leave a room you haven't joined (NOT_IN_ROOM)", async () => {
      const alice = await connect(a, "alice");
      alice.send({ type: "message", room: "general", text: "sneaky" });
      expect(await alice.nextOfType("error")).toMatchObject({ code: "NOT_IN_ROOM" });
      alice.send({ type: "leave", room: "general" });
      expect(await alice.nextOfType("error")).toMatchObject({ code: "NOT_IN_ROOM" });
      expect(await a.chat.history("general"), "nothing may be stored").toEqual([]);
    });
  });

  describe("presence and cleanup", () => {
    it("broadcasts join and leave presence across instances (leave on disconnect too)", async () => {
      const bob = await connect(b, "bob");
      await joined(bob, "general");
      const alice = await connect(a, "alice");
      await joined(alice, "general");
      expect(await bob.nextOfType("presence", (m) => m.user === "alice")).toEqual({
        type: "presence",
        room: "general",
        user: "alice",
        change: "join",
      });
      await alice.close();
      expect(await bob.nextOfType("presence", (m) => m.user === "alice")).toMatchObject({ change: "leave" });
    });

    it("removes a disconnected client's subscriptions from the hub", async () => {
      const alice = await connect(a, "alice");
      await joined(alice, "general");
      await joined(alice, "random");
      expect(a.hub.subscriberCount("general")).toBe(1);
      await alice.close();
      await eventually(() => a.hub.roomCount() === 0, "hub to have no rooms after disconnect");
      await eventually(() => a.chatServer.connectionCount() === 0, "connectionCount() to drop to 0");
    });
  });

  describe("heartbeat", () => {
    let fast: Instance;
    beforeEach(async () => {
      fast = await start(prefix, { heartbeatMs: 100 });
    });
    afterEach(() => fast.close());

    it("terminates a client that stops answering pings, and announces it left", async () => {
      const watcher = await connect(fast, "watcher");
      await joined(watcher, "general");
      // autoPong: false makes this client behave like a dead peer: it never answers pings.
      const zombie = await TestClient.connect(fast.wsUrl, "zombie", { autoPong: false });
      clients.push(zombie);
      await joined(zombie, "general");

      const code = await Promise.race([zombie.closed, sleep(2_000).then(() => "still open")]);
      expect(code, "the server should drop a client that never pongs within a few heartbeats").not.toBe("still open");
      expect(await watcher.nextOfType("presence", (m) => m.user === "zombie" && m.change === "leave")).toBeTruthy();
    });

    it("keeps healthy clients connected across many heartbeats", async () => {
      const healthy = await connect(fast, "healthy");
      await sleep(600);
      expect(healthy.closeCode).toBeUndefined();
      expect((await joined(healthy, "general")).room).toBe("general");
    });
  });
});
