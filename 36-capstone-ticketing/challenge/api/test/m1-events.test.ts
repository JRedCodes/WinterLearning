import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  closeTestContext,
  createEvent,
  createTestContext,
  ORGANIZER,
  ORGANIZER_2,
  resetState,
  SHOW_TIME,
  signUp,
  type Session,
  type TestContext,
} from "./helpers/context.js";

describe("M1 · events & seat maps", () => {
  let ctx: TestContext;
  let organizer: Session;
  let customer: Session;

  beforeAll(async () => {
    ctx = await createTestContext();
  });
  beforeEach(async () => {
    await resetState(ctx);
    organizer = await signUp(ctx.app, ORGANIZER, "Olive Organizer");
    customer = await signUp(ctx.app, "fan@example.com", "Fan");
  });
  afterAll(async () => {
    await closeTestContext(ctx);
  });

  describe("POST /events", () => {
    it("lets an organizer create an event with a generated seat grid", async () => {
      const res = await request(ctx.app).post("/events").set(organizer.auth).send({
        name: "Winter Synth Night",
        venue: "The Warehouse",
        startsAt: SHOW_TIME,
        priceCents: 2500,
        rows: 3,
        seatsPerRow: 4,
      });
      expect(res.status, JSON.stringify(res.body)).toBe(201);
      expect(res.body.data).toEqual({
        id: expect.any(String),
        name: "Winter Synth Night",
        venue: "The Warehouse",
        startsAt: SHOW_TIME,
        priceCents: 2500,
        totalSeats: 12,
        organizerId: organizer.user.id,
      });
      expect(res.headers.location).toBe(`/events/${res.body.data.id}`);
    });

    it("forbids customers (403) and anonymous callers (401)", async () => {
      const body = { name: "x", venue: "y", startsAt: SHOW_TIME, priceCents: 100, rows: 1, seatsPerRow: 1 };
      const asCustomer = await request(ctx.app).post("/events").set(customer.auth).send(body);
      const anonymous = await request(ctx.app).post("/events").send(body);
      expect(asCustomer.status).toBe(403);
      expect(asCustomer.body.error.code).toBe("FORBIDDEN");
      expect(anonymous.status).toBe(401);
    });

    it("validates the payload (rows 1-26, seatsPerRow 1-50, priceCents >= 0, ISO startsAt)", async () => {
      const res = await request(ctx.app).post("/events").set(organizer.auth).send({
        name: "Bad",
        venue: "Nowhere",
        startsAt: "next tuesday",
        priceCents: -1,
        rows: 0,
        seatsPerRow: 51,
      });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
      const paths = (res.body.error.details as { path: string }[]).map((d) => d.path);
      expect(paths).toEqual(expect.arrayContaining(["startsAt", "priceCents", "rows", "seatsPerRow"]));
    });

    it("rejects events that start in the past (according to the injected clock)", async () => {
      const res = await request(ctx.app).post("/events").set(organizer.auth).send({
        name: "Yesterday",
        venue: "Time machine",
        startsAt: "2029-12-31T20:00:00.000Z", // the test clock says it's 2030-01-01
        priceCents: 100,
        rows: 1,
        seatsPerRow: 1,
      });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    });
  });

  describe("reading events", () => {
    it("GET /events/:id returns the event; unknown or malformed ids are 404 NOT_FOUND", async () => {
      const event = await createEvent(ctx.app, organizer);
      const found = await request(ctx.app).get(`/events/${event.id}`);
      expect(found.status).toBe(200);
      expect(found.body.data).toEqual(event);

      const missing = await request(ctx.app).get(`/events/${randomUUID()}`);
      const malformed = await request(ctx.app).get("/events/not-a-uuid");
      expect(missing.status).toBe(404);
      expect(missing.body.error.code).toBe("NOT_FOUND");
      expect(malformed.status).toBe(404);
    });

    it("GET /events lists upcoming events, soonest first", async () => {
      const later = await createEvent(ctx.app, organizer, { name: "Later", startsAt: "2030-09-01T19:00:00.000Z" });
      const sooner = await createEvent(ctx.app, organizer, { name: "Sooner", startsAt: "2030-02-01T19:00:00.000Z" });
      const res = await request(ctx.app).get("/events");
      expect(res.status).toBe(200);
      expect((res.body.data as { id: string }[]).map((e) => e.id)).toEqual([sooner.id, later.id]);
    });

    it("GET /events hides events that have already started", async () => {
      const sooner = await createEvent(ctx.app, organizer, { name: "Sooner", startsAt: "2030-02-01T19:00:00.000Z" });
      const later = await createEvent(ctx.app, organizer, { name: "Later", startsAt: "2030-09-01T19:00:00.000Z" });
      ctx.clock.set(new Date("2030-03-01T00:00:00.000Z"));
      const res = await request(ctx.app).get("/events");
      const ids = (res.body.data as { id: string }[]).map((e) => e.id);
      expect(ids).toEqual([later.id]);
      expect(ids).not.toContain(sooner.id);
    });

    it("GET /events/:id/seats returns every seat, ordered by row then number, all available", async () => {
      const event = await createEvent(ctx.app, organizer, { rows: 2, seatsPerRow: 3 });
      const res = await request(ctx.app).get(`/events/${event.id}/seats`);
      expect(res.status).toBe(200);
      expect(res.body.data.eventId).toBe(event.id);
      expect(res.body.data.seats).toEqual([
        { id: "A1", row: "A", number: 1, status: "available" },
        { id: "A2", row: "A", number: 2, status: "available" },
        { id: "A3", row: "A", number: 3, status: "available" },
        { id: "B1", row: "B", number: 1, status: "available" },
        { id: "B2", row: "B", number: 2, status: "available" },
        { id: "B3", row: "B", number: 3, status: "available" },
      ]);
    });

    it("GET /events/:id/seats is 404 for an unknown event", async () => {
      const res = await request(ctx.app).get(`/events/${randomUUID()}/seats`);
      expect(res.status).toBe(404);
    });
  });

  describe("PATCH /events/:id", () => {
    it("lets the owning organizer update details", async () => {
      const event = await createEvent(ctx.app, organizer);
      const res = await request(ctx.app)
        .patch(`/events/${event.id}`)
        .set(organizer.auth)
        .send({ name: "Winter Synth Night (moved)", venue: "The Big Hall" });
      expect(res.status, JSON.stringify(res.body)).toBe(200);
      expect(res.body.data).toEqual({ ...event, name: "Winter Synth Night (moved)", venue: "The Big Hall" });
    });

    it("forbids other organizers and customers (403)", async () => {
      const event = await createEvent(ctx.app, organizer);
      const other = await signUp(ctx.app, ORGANIZER_2);
      const byOther = await request(ctx.app).patch(`/events/${event.id}`).set(other.auth).send({ name: "Mine now" });
      const byCustomer = await request(ctx.app).patch(`/events/${event.id}`).set(customer.auth).send({ name: "x" });
      expect(byOther.status).toBe(403);
      expect(byCustomer.status).toBe(403);
    });

    it("rejects an empty patch with 400", async () => {
      const event = await createEvent(ctx.app, organizer);
      const res = await request(ctx.app).patch(`/events/${event.id}`).set(organizer.auth).send({});
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    });
  });
});
