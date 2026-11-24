import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { buildContainer, type Container } from "../src/container.js";
import {
  book,
  closeTestContext,
  createEvent,
  createTestContext,
  holdOk,
  ORGANIZER,
  resetState,
  signUp,
  type EventBody,
  type Session,
  type TestContext,
} from "./helpers/context.js";
import { SseStream, startServer, type RunningServer } from "./helpers/sse.js";

interface SeatChange {
  id: string;
  status: string;
}

function changesOf(data: unknown): Record<string, string> {
  const d = data as { eventId: string; changes: SeatChange[] };
  return Object.fromEntries(d.changes.map((c) => [c.id, c.status]));
}

describe("M5 · live seat map over Server-Sent Events", () => {
  let ctx: TestContext;
  let server: RunningServer;
  let event: EventBody;
  let alice: Session;
  const streams: SseStream[] = [];

  async function open(base: string, path: string) {
    const s = await SseStream.open(`${base}${path}`);
    streams.push(s);
    return s;
  }

  beforeAll(async () => {
    ctx = await createTestContext();
    server = await startServer(ctx.app);
  });
  beforeEach(async () => {
    await resetState(ctx);
    const organizer = await signUp(ctx.app, ORGANIZER);
    event = await createEvent(ctx.app, organizer, { rows: 1, seatsPerRow: 4 });
    alice = await signUp(ctx.app, "alice@example.com");
  });
  afterEach(() => {
    for (const s of streams.splice(0)) s.close();
  });
  afterAll(async () => {
    await server?.close();
    await closeTestContext(ctx);
  });

  it("starts with a snapshot of the whole seat map", async () => {
    const stream = await open(server.url, `/events/${event.id}/seats/stream`);
    expect(stream.status).toBe(200);
    expect(stream.contentType).toContain("text/event-stream");
    const snapshot = await stream.next("snapshot");
    const data = snapshot.data as { eventId: string; seats: { id: string; status: string }[] };
    expect(data.eventId).toBe(event.id);
    expect(data.seats.map((s) => `${s.id}:${s.status}`)).toEqual([
      "A1:available",
      "A2:available",
      "A3:available",
      "A4:available",
    ]);
  });

  it("pushes 'seats' changes when seats are held, booked and released", async () => {
    const stream = await open(server.url, `/events/${event.id}/seats/stream`);
    await stream.next("snapshot");

    const hold = await holdOk(ctx.app, alice, event.id, ["A1", "A2"]);
    expect(changesOf((await stream.next("seats")).data)).toEqual({ A1: "held", A2: "held" });

    expect((await book(ctx.app, alice, hold.id)).status).toBe(201);
    expect(changesOf((await stream.next("seats")).data)).toEqual({ A1: "booked", A2: "booked" });

    const other = await holdOk(ctx.app, alice, event.id, ["A4"]);
    expect(changesOf((await stream.next("seats")).data)).toEqual({ A4: "held" });
    await request(ctx.app).delete(`/holds/${other.id}`).set(alice.auth);
    expect(changesOf((await stream.next("seats")).data)).toEqual({ A4: "available" });
  });

  it("only streams changes for the requested event", async () => {
    const organizer = await signUp(ctx.app, "organizer2@example.com");
    const otherEvent = await createEvent(ctx.app, organizer, { rows: 1, seatsPerRow: 2 });
    const stream = await open(server.url, `/events/${event.id}/seats/stream`);
    await stream.next("snapshot");
    await holdOk(ctx.app, alice, otherEvent.id, ["A1"]);
    await holdOk(ctx.app, alice, event.id, ["A3"]);
    const msg = await stream.next("seats");
    expect((msg.data as { eventId: string }).eventId).toBe(event.id);
    expect(changesOf(msg.data)).toEqual({ A3: "held" });
  });

  it("fans out across app instances through Redis pub/sub", async () => {
    // A second, independent instance: own container, own subscriber connection, own HTTP server.
    const container2: Container = buildContainer({
      config: ctx.config,
      pool: ctx.pool,
      redis: ctx.redis,
      clock: ctx.clock,
      publisher: ctx.publisher,
      emailSender: ctx.emailSender,
    });
    const server2 = await startServer(createApp(container2));
    try {
      const stream = await open(server2.url, `/events/${event.id}/seats/stream`);
      await stream.next("snapshot");
      await holdOk(ctx.app, alice, event.id, ["A2"]); // through instance 1
      expect(changesOf((await stream.next("seats")).data)).toEqual({ A2: "held" });
    } finally {
      for (const s of streams.splice(0)) s.close();
      await server2.close();
      await container2.close();
    }
  });

  it("the hold sweeper releases expired holds and broadcasts it", async () => {
    const hold = await holdOk(ctx.app, alice, event.id, ["A3", "A4"]);
    const stream = await open(server.url, `/events/${event.id}/seats/stream`);
    await stream.next("snapshot");

    expect(await ctx.container.holdSweeper.runOnce(), "nothing has expired yet").toBe(0);
    ctx.clock.advance(600_001);
    expect(await ctx.container.holdSweeper.runOnce()).toBe(2);
    expect(changesOf((await stream.next("seats")).data)).toEqual({ A3: "available", A4: "available" });
    expect(await ctx.container.holdSweeper.runOnce(), "already swept").toBe(0);

    const h = await request(ctx.app).get(`/holds/${hold.id}`).set(alice.auth);
    expect(h.body.data.status).toBe("expired");
  });

  it("is 404 for an unknown event", async () => {
    const res = await request(ctx.app).get(`/events/${randomUUID()}/seats/stream`);
    expect(res.status).toBe(404);
  });
});
