/**
 * HTTP behavior tests: the contract the frontend relies on.
 *
 * These PASS on the starter. They are your safety net (characterization tests):
 * keep them green during the whole refactor. If one goes red, your refactor
 * changed behavior. Undo the last step, don't "fix" the test.
 */
import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { createContainer } from "../src/container.js";

type App = ReturnType<typeof createApp>;

const FUTURE = "2099-06-01T18:00:00.000Z";

async function createEvent(app: App, body: Record<string, unknown> = {}) {
  const res = await request(app)
    .post("/events")
    .send({ title: "Rooftop meetup", capacity: 10, startsAt: FUTURE, ...body });
  expect(res.status, `POST /events failed: ${JSON.stringify(res.body)}`).toBe(201);
  return res.body.data as { id: string; capacity: number };
}

async function rsvp(app: App, eventId: string, body: Record<string, unknown>) {
  return request(app).post(`/events/${eventId}/rsvps`).send(body);
}

async function okRsvp(app: App, eventId: string, body: Record<string, unknown>) {
  const res = await rsvp(app, eventId, body);
  expect(res.status, `POST rsvp failed: ${JSON.stringify(res.body)}`).toBe(201);
  return res.body.data as { id: string; status: string };
}

describe("RSVP API (behavior must not change during the refactor)", () => {
  let app: App;
  beforeEach(() => {
    app = createApp(createContainer());
  });

  it("GET /health", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok" });
  });

  describe("events", () => {
    it("POST /events creates an event with seat stats and a Location header", async () => {
      const res = await request(app)
        .post("/events")
        .send({ title: "  Rust meetup ", capacity: 30, startsAt: "2099-03-04T19:00:00Z" });
      expect(res.status).toBe(201);
      expect(res.body.data).toMatchObject({
        title: "Rust meetup",
        capacity: 30,
        startsAt: "2099-03-04T19:00:00.000Z",
        seatsTaken: 0,
        seatsLeft: 30,
        waitlistCount: 0,
      });
      expect(res.body.data.id).toEqual(expect.any(String));
      expect(res.body.data.createdAt).toEqual(expect.any(String));
      expect(res.headers.location).toBe(`/events/${res.body.data.id}`);
    });

    it.each([
      ["missing title", { capacity: 5, startsAt: FUTURE }],
      ["blank title", { title: "  ", capacity: 5, startsAt: FUTURE }],
      ["title over 200 chars", { title: "t".repeat(201), capacity: 5, startsAt: FUTURE }],
      ["capacity as a string", { title: "x", capacity: "5", startsAt: FUTURE }],
      ["fractional capacity", { title: "x", capacity: 2.5, startsAt: FUTURE }],
      ["zero capacity", { title: "x", capacity: 0, startsAt: FUTURE }],
      ["missing startsAt", { title: "x", capacity: 5 }],
      ["unparseable startsAt", { title: "x", capacity: 5, startsAt: "next friday" }],
      ["startsAt in the past", { title: "x", capacity: 5, startsAt: "2001-01-01T00:00:00Z" }],
    ])("POST /events rejects %s with 400 VALIDATION_ERROR", async (_label, body) => {
      const res = await request(app).post("/events").send(body);
      expect(res.status).toBe(400);
      expect(res.body.error).toMatchObject({ code: "VALIDATION_ERROR", message: expect.any(String) });
    });

    it("GET /events lists events sorted by start time", async () => {
      const later = await createEvent(app, { title: "later", startsAt: "2099-12-01T00:00:00Z" });
      const sooner = await createEvent(app, { title: "sooner", startsAt: "2099-01-01T00:00:00Z" });
      const res = await request(app).get("/events");
      expect(res.status).toBe(200);
      const ids = (res.body.data as { id: string }[]).map((e) => e.id);
      expect(ids).toContain(later.id);
      expect(ids.indexOf(sooner.id)).toBeLessThan(ids.indexOf(later.id));
    });

    it("GET /events/:id returns live seat stats", async () => {
      const ev = await createEvent(app, { capacity: 10 });
      await okRsvp(app, ev.id, { name: "Ana", email: "ana@example.com", partySize: 2 });
      await okRsvp(app, ev.id, { name: "Ben", email: "ben@example.com", partySize: 3 });
      await okRsvp(app, ev.id, { name: "Cy", email: "cy@example.com", partySize: 6 }); // waitlisted
      const res = await request(app).get(`/events/${ev.id}`);
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({ seatsTaken: 5, seatsLeft: 5, waitlistCount: 1 });
    });

    it("GET /events/:id returns 404 EVENT_NOT_FOUND", async () => {
      const res = await request(app).get("/events/evt_nope");
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe("EVENT_NOT_FOUND");
    });

    it("PATCH /events/:id renames an event", async () => {
      const ev = await createEvent(app);
      const res = await request(app).patch(`/events/${ev.id}`).send({ title: " Renamed " });
      expect(res.status).toBe(200);
      expect(res.body.data.event).toMatchObject({ id: ev.id, title: "Renamed" });
      expect(res.body.data.promoted).toEqual([]);
    });

    it("PATCH /events/:id raising capacity lets the waitlist in", async () => {
      const ev = await createEvent(app, { capacity: 2 });
      await okRsvp(app, ev.id, { name: "Ana", email: "ana@example.com", partySize: 1 });
      const waiting = await okRsvp(app, ev.id, { name: "Ben", email: "ben@example.com", partySize: 2 });
      expect(waiting.status).toBe("waitlisted");

      const res = await request(app).patch(`/events/${ev.id}`).send({ capacity: 3 });
      expect(res.status).toBe(200);
      expect(res.body.data.event).toMatchObject({ capacity: 3, seatsTaken: 3, waitlistCount: 0 });
      expect(res.body.data.promoted).toMatchObject([{ id: waiting.id, status: "confirmed" }]);
    });

    it("PATCH /events/:id refuses capacity below confirmed seats (409 CAPACITY_TOO_LOW)", async () => {
      const ev = await createEvent(app, { capacity: 10 });
      await okRsvp(app, ev.id, { name: "Ana", email: "ana@example.com", partySize: 4 });
      const res = await request(app).patch(`/events/${ev.id}`).send({ capacity: 3 });
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe("CAPACITY_TOO_LOW");
    });

    it.each([
      ["an empty patch", {}],
      ["a non-integer capacity", { capacity: 1.5 }],
      ["a blank title", { title: "" }],
    ])("PATCH /events/:id rejects %s with 400", async (_label, body) => {
      const ev = await createEvent(app);
      const res = await request(app).patch(`/events/${ev.id}`).send(body);
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    });

    it("PATCH /events/:id returns 404 for a missing event", async () => {
      const res = await request(app).patch("/events/evt_nope").send({ title: "x" });
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe("EVENT_NOT_FOUND");
    });
  });

  describe("rsvps", () => {
    it("POST /events/:id/rsvps confirms when seats are available", async () => {
      const ev = await createEvent(app);
      const res = await rsvp(app, ev.id, { name: " Ana ", email: "Ana@Example.COM" });
      expect(res.status).toBe(201);
      expect(res.body.data).toMatchObject({
        eventId: ev.id,
        name: "Ana",
        email: "ana@example.com",
        partySize: 1,
        status: "confirmed",
      });
      expect(res.body.data.id).toEqual(expect.any(String));
    });

    it("waitlists a party that doesn't fit", async () => {
      const ev = await createEvent(app, { capacity: 3 });
      await okRsvp(app, ev.id, { name: "Ana", email: "ana@example.com", partySize: 1 });
      const res = await rsvp(app, ev.id, { name: "Ben", email: "ben@example.com", partySize: 3 });
      expect(res.status).toBe(201);
      expect(res.body.data.status).toBe("waitlisted");
    });

    it.each([
      ["missing name", { email: "a@example.com" }],
      ["invalid email", { name: "A", email: "not-an-email" }],
      ["zero partySize", { name: "A", email: "a@example.com", partySize: 0 }],
      ["string partySize", { name: "A", email: "a@example.com", partySize: "2" }],
      ["fractional partySize", { name: "A", email: "a@example.com", partySize: 1.5 }],
      ["partySize above the configured max (default 6)", { name: "A", email: "a@example.com", partySize: 7 }],
    ])("rejects %s with 400 VALIDATION_ERROR", async (_label, body) => {
      const ev = await createEvent(app);
      const res = await rsvp(app, ev.id, body);
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    });

    it("returns 404 EVENT_NOT_FOUND for an unknown event", async () => {
      const res = await rsvp(app, "evt_nope", { name: "A", email: "a@example.com" });
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe("EVENT_NOT_FOUND");
    });

    it("rejects a second RSVP from the same email, case-insensitively (409 ALREADY_RSVPED)", async () => {
      const ev = await createEvent(app);
      await okRsvp(app, ev.id, { name: "Ana", email: "ana@example.com" });
      const res = await rsvp(app, ev.id, { name: "Ana again", email: "ANA@example.com" });
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe("ALREADY_RSVPED");
    });

    it("GET /events/:id/rsvps lists active RSVPs in booking order", async () => {
      const ev = await createEvent(app);
      const a = await okRsvp(app, ev.id, { name: "Ana", email: "ana@example.com" });
      const b = await okRsvp(app, ev.id, { name: "Ben", email: "ben@example.com" });
      const res = await request(app).get(`/events/${ev.id}/rsvps`);
      expect(res.status).toBe(200);
      expect(res.body.data.map((r: { id: string }) => r.id)).toEqual([a.id, b.id]);
    });

    it("DELETE cancels an RSVP, hides it from the list, and allows rebooking", async () => {
      const ev = await createEvent(app);
      const a = await okRsvp(app, ev.id, { name: "Ana", email: "ana@example.com" });

      const del = await request(app).delete(`/events/${ev.id}/rsvps/${a.id}`);
      expect(del.status).toBe(200);
      expect(del.body.data.cancelled).toMatchObject({ id: a.id, status: "cancelled" });
      expect(del.body.data.promoted).toEqual([]);

      const list = await request(app).get(`/events/${ev.id}/rsvps`);
      expect(list.body.data).toEqual([]);

      const again = await rsvp(app, ev.id, { name: "Ana", email: "ana@example.com" });
      expect(again.status).toBe(201);
    });

    it("DELETE of a confirmed RSVP promotes the waitlist", async () => {
      const ev = await createEvent(app, { capacity: 2 });
      const a = await okRsvp(app, ev.id, { name: "Ana", email: "ana@example.com", partySize: 1 });
      const b = await okRsvp(app, ev.id, { name: "Ben", email: "ben@example.com", partySize: 2 });
      expect(b.status).toBe("waitlisted");

      const del = await request(app).delete(`/events/${ev.id}/rsvps/${a.id}`);
      expect(del.status).toBe(200);
      expect(del.body.data.promoted).toMatchObject([{ id: b.id, status: "confirmed" }]);
    });

    it("DELETE returns 404 RSVP_NOT_FOUND for unknown or already-cancelled RSVPs", async () => {
      const ev = await createEvent(app);
      const a = await okRsvp(app, ev.id, { name: "Ana", email: "ana@example.com" });
      await request(app).delete(`/events/${ev.id}/rsvps/${a.id}`).expect(200);

      const twice = await request(app).delete(`/events/${ev.id}/rsvps/${a.id}`);
      expect(twice.status).toBe(404);
      expect(twice.body.error.code).toBe("RSVP_NOT_FOUND");

      const unknown = await request(app).delete(`/events/${ev.id}/rsvps/rsvp_nope`);
      expect(unknown.status).toBe(404);
    });
  });

  describe("fallbacks", () => {
    it("unknown routes return JSON 404 ROUTE_NOT_FOUND", async () => {
      const res = await request(app).get("/nope");
      expect(res.status).toBe(404);
      expect(res.body.error).toMatchObject({ code: "ROUTE_NOT_FOUND", message: "Cannot GET /nope" });
    });

    it("malformed JSON returns 400 INVALID_JSON", async () => {
      const res = await request(app)
        .post("/events")
        .set("Content-Type", "application/json")
        .send('{"title": ');
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("INVALID_JSON");
    });
  });
});
