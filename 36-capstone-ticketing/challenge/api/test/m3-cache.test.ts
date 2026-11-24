import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  closeTestContext,
  createEvent,
  createTestContext,
  holdOk,
  ORGANIZER,
  resetState,
  signUp,
  type Session,
  type TestContext,
} from "./helpers/context.js";

describe("M3 · caching event reads in Redis", () => {
  let ctx: TestContext;
  let organizer: Session;

  beforeAll(async () => {
    ctx = await createTestContext();
  });
  beforeEach(async () => {
    await resetState(ctx);
    organizer = await signUp(ctx.app, ORGANIZER);
  });
  afterAll(async () => {
    await closeTestContext(ctx);
  });

  it("GET /events/:id is cache-aside: MISS, then HIT with an identical body", async () => {
    const event = await createEvent(ctx.app, organizer);
    const first = await request(ctx.app).get(`/events/${event.id}`);
    const second = await request(ctx.app).get(`/events/${event.id}`);
    expect(first.headers["x-cache"]).toBe("MISS");
    expect(second.headers["x-cache"]).toBe("HIT");
    expect(second.body).toEqual(first.body);
  });

  it("an update invalidates the cached event, so the next read is fresh", async () => {
    const event = await createEvent(ctx.app, organizer);
    await request(ctx.app).get(`/events/${event.id}`); // warm the cache
    await request(ctx.app).patch(`/events/${event.id}`).set(organizer.auth).send({ name: "Renamed" });
    const res = await request(ctx.app).get(`/events/${event.id}`);
    expect(res.headers["x-cache"]).toBe("MISS");
    expect(res.body.data.name).toBe("Renamed");
  });

  it("GET /events is cached too, and creating or updating an event invalidates it", async () => {
    const a = await createEvent(ctx.app, organizer, { name: "A" });
    expect((await request(ctx.app).get("/events")).headers["x-cache"]).toBe("MISS");
    expect((await request(ctx.app).get("/events")).headers["x-cache"]).toBe("HIT");

    const b = await createEvent(ctx.app, organizer, { name: "B", startsAt: "2030-07-01T19:00:00.000Z" });
    const afterCreate = await request(ctx.app).get("/events");
    expect((afterCreate.body.data as { id: string }[]).map((e) => e.id)).toEqual([a.id, b.id]);

    await request(ctx.app).get("/events");
    await request(ctx.app).patch(`/events/${a.id}`).set(organizer.auth).send({ name: "A (updated)" });
    const afterUpdate = await request(ctx.app).get("/events");
    expect(afterUpdate.body.data[0].name).toBe("A (updated)");
  });

  it("a cached list still hides events that started after it was cached", async () => {
    const soon = await createEvent(ctx.app, organizer, { startsAt: "2030-02-01T19:00:00.000Z" });
    const later = await createEvent(ctx.app, organizer, { startsAt: "2030-08-01T19:00:00.000Z" });
    await request(ctx.app).get("/events"); // cached while both are upcoming
    ctx.clock.set(new Date("2030-03-01T00:00:00.000Z"));
    const res = await request(ctx.app).get("/events");
    expect(res.headers["x-cache"]).toBe("HIT");
    expect((res.body.data as { id: string }[]).map((e) => e.id)).toEqual([later.id]);
    expect(soon.id).toBeDefined();
  });

  it("never caches seat availability: a hold shows up on the very next seat-map read", async () => {
    const event = await createEvent(ctx.app, organizer);
    const fan = await signUp(ctx.app, "fan@example.com");
    const before = await request(ctx.app).get(`/events/${event.id}/seats`);
    await holdOk(ctx.app, fan, event.id, ["A1"]);
    const after = await request(ctx.app).get(`/events/${event.id}/seats`);
    expect(before.body.data.seats[0].status).toBe("available");
    expect(after.body.data.seats[0].status).toBe("held");
    expect(after.headers["x-cache"]).not.toBe("HIT");
  });

  it("unknown events stay 404 on repeated reads", async () => {
    const id = randomUUID();
    expect((await request(ctx.app).get(`/events/${id}`)).status).toBe(404);
    expect((await request(ctx.app).get(`/events/${id}`)).status).toBe(404);
  });

  it("every Redis key the app creates starts with REDIS_KEY_PREFIX (wl:36:)", async () => {
    const event = await createEvent(ctx.app, organizer);
    await request(ctx.app).get(`/events/${event.id}`);
    await request(ctx.app).get("/events");
    const keys = await ctx.redis.keys("*");
    const foreign = keys.filter((k) => !k.startsWith(ctx.config.redisKeyPrefix));
    expect(keys.length, "expected cache and session keys in Redis").toBeGreaterThan(0);
    expect(foreign, "keys outside the module prefix").toEqual([]);
  });
});
