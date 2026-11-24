/**
 * Wiring tests: does dependency injection actually work?
 *
 *  - createApp(deps) must use the services it is GIVEN (not build its own).
 *  - The error handler maps domain errors to HTTP.
 *  - createContainer() builds an isolated object graph and honors overrides
 *    (config, clock), so nothing is hidden in module-level globals.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { createContainer } from "../src/container.js";
import { EventAlreadyStartedError, EventNotFoundError } from "../src/domain/errors.js";
import type { EventWithStats } from "../src/domain/event.js";
import type { EventService } from "../src/services/eventService.js";
import type { RsvpService } from "../src/services/rsvpService.js";
import { FakeClock } from "./support/fakes.js";

const notUsed = () => {
  throw new Error("not used in this test");
};

function fakeEventService(overrides: Partial<Record<keyof EventService, unknown>>): EventService {
  return { create: notUsed, list: notUsed, get: notUsed, update: notUsed, ...overrides } as unknown as EventService;
}

function fakeRsvpService(overrides: Partial<Record<keyof RsvpService, unknown>>): RsvpService {
  return { create: notUsed, listForEvent: notUsed, cancel: notUsed, ...overrides } as unknown as RsvpService;
}

const injected: EventWithStats = {
  id: "evt_injected",
  title: "Injected event",
  capacity: 5,
  startsAt: new Date("2031-02-03T04:05:06.000Z"),
  createdAt: new Date("2030-01-01T00:00:00.000Z"),
  seatsTaken: 2,
  seatsLeft: 3,
  waitlistCount: 0,
};

describe("createApp(deps) uses injected services", () => {
  afterEach(() => vi.restoreAllMocks());

  it("serves data from the injected EventService and serializes dates as ISO strings", async () => {
    const app = createApp({
      eventService: fakeEventService({ list: async () => [injected] }),
      rsvpService: fakeRsvpService({}),
    });
    const res = await request(app).get("/events");
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([
      {
        id: "evt_injected",
        title: "Injected event",
        capacity: 5,
        startsAt: "2031-02-03T04:05:06.000Z",
        createdAt: "2030-01-01T00:00:00.000Z",
        seatsTaken: 2,
        seatsLeft: 3,
        waitlistCount: 0,
      },
    ]);
  });

  it("validates request shape in the controller, before calling the service", async () => {
    const create = vi.fn();
    const app = createApp({
      eventService: fakeEventService({ create }),
      rsvpService: fakeRsvpService({}),
    });
    const res = await request(app).post("/events").send({ title: "x", capacity: "5", startsAt: "2099-01-01T00:00:00Z" });
    expect(res.status).toBe(400);
    expect(create).not.toHaveBeenCalled();
  });

  it("passes a parsed Date (not a string) to EventService.create", async () => {
    const create = vi.fn(async () => injected);
    const app = createApp({ eventService: fakeEventService({ create }), rsvpService: fakeRsvpService({}) });
    await request(app).post("/events").send({ title: " Hi ", capacity: 5, startsAt: "2099-01-01T00:00:00Z" }).expect(201);
    expect(create).toHaveBeenCalledWith({ title: "Hi", capacity: 5, startsAt: new Date("2099-01-01T00:00:00Z") });
  });

  it("maps domain errors to HTTP in the error handler", async () => {
    const app = createApp({
      eventService: fakeEventService({
        get: async () => {
          throw new EventNotFoundError("evt_1");
        },
      }),
      rsvpService: fakeRsvpService({
        create: async () => {
          throw new EventAlreadyStartedError("evt_1");
        },
      }),
    });

    const notFound = await request(app).get("/events/evt_1");
    expect(notFound.status).toBe(404);
    expect(notFound.body.error.code).toBe("EVENT_NOT_FOUND");

    const started = await request(app).post("/events/evt_1/rsvps").send({ name: "A", email: "a@example.com" });
    expect(started.status).toBe(409);
    expect(started.body.error.code).toBe("EVENT_STARTED");
  });

  it("turns unexpected errors into a generic 500 and logs them", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const app = createApp({
      eventService: fakeEventService({
        list: async () => {
          throw new Error("connection to db-primary-7 refused");
        },
      }),
      rsvpService: fakeRsvpService({}),
    });
    const res = await request(app).get("/events");
    expect(res.status).toBe(500);
    expect(res.body.error).toEqual({ code: "INTERNAL_ERROR", message: "Something went wrong" });
    expect(log).toHaveBeenCalled();
  });
});

describe("createContainer() builds the object graph", () => {
  it("gives each container its own state (no module-level globals)", async () => {
    const app1 = createApp(createContainer());
    const app2 = createApp(createContainer());
    const created = await request(app1)
      .post("/events")
      .send({ title: "Only in app1", capacity: 3, startsAt: "2099-01-01T00:00:00Z" })
      .expect(201);
    const res = await request(app2).get(`/events/${created.body.data.id}`);
    expect(res.status, "app2 can see app1's event: state is shared through a global").toBe(404);
  });

  it("injects config into the services (maxPartySize)", async () => {
    const app = createApp(createContainer({ config: { port: 0, maxPartySize: 2 } }));
    const ev = await request(app)
      .post("/events")
      .send({ title: "Small dinner", capacity: 10, startsAt: "2099-01-01T00:00:00Z" })
      .expect(201);
    const tooBig = await request(app)
      .post(`/events/${ev.body.data.id}/rsvps`)
      .send({ name: "A", email: "a@example.com", partySize: 3 });
    expect(tooBig.status).toBe(400);
    const ok = await request(app)
      .post(`/events/${ev.body.data.id}/rsvps`)
      .send({ name: "B", email: "b@example.com", partySize: 2 });
    expect(ok.status).toBe(201);
  });

  it("injects the clock all the way down (time-based rules are testable over HTTP)", async () => {
    const clock = new FakeClock("2040-01-01T00:00:00.000Z");
    const app = createApp(createContainer({ clock }));
    const ev = await request(app)
      .post("/events")
      .send({ title: "Launch party", capacity: 10, startsAt: "2040-02-01T18:00:00Z" })
      .expect(201);
    expect(ev.body.data.createdAt).toBe("2040-01-01T00:00:00.000Z");

    clock.set("2040-02-01T19:00:00.000Z"); // the party has started
    const late = await request(app)
      .post(`/events/${ev.body.data.id}/rsvps`)
      .send({ name: "Late", email: "late@example.com" });
    expect(late.status).toBe(409);
    expect(late.body.error.code).toBe("EVENT_STARTED");
  });
});
