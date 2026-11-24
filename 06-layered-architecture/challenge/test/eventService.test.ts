/**
 * Unit tests for event rules: creation invariants, seat stats, capacity changes.
 * No HTTP. Fakes come in through the constructor.
 */
import { describe, expect, it } from "vitest";
import { EventService } from "../src/services/eventService.js";
import {
  CapacityTooLowError,
  EventAlreadyStartedError,
  EventNotFoundError,
  ValidationError,
} from "../src/domain/errors.js";
import type { Rsvp } from "../src/domain/rsvp.js";
import { FakeClock, FakeEventRepository, FakeRsvpRepository, makeEvent, sequentialIds } from "./support/fakes.js";

const NOW = "2030-01-01T12:00:00.000Z";

function setup() {
  const events = new FakeEventRepository();
  const rsvps = new FakeRsvpRepository();
  const clock = new FakeClock(NOW);
  const service = new EventService({ events, rsvps, clock, ids: sequentialIds() });
  return { service, events, rsvps, clock };
}

let n = 0;
function seedRsvp(rsvps: FakeRsvpRepository, eventId: string, partySize: number, status: Rsvp["status"]): Rsvp {
  const rsvp: Rsvp = {
    id: `seed_${++n}`,
    eventId,
    name: `Guest ${n}`,
    email: `guest${n}@example.com`,
    partySize,
    status,
    createdAt: new Date(NOW),
    cancelledAt: status === "cancelled" ? new Date(NOW) : null,
  };
  rsvps.rows.push(rsvp);
  return rsvp;
}

describe("EventService.create", () => {
  it("creates and stores an event with empty seat stats", async () => {
    const { service, events } = setup();
    const ev = await service.create({ title: "Rooftop", capacity: 20, startsAt: new Date("2030-02-01T18:00:00Z") });
    expect(ev).toMatchObject({
      id: "evt_1",
      title: "Rooftop",
      capacity: 20,
      seatsTaken: 0,
      seatsLeft: 20,
      waitlistCount: 0,
    });
    expect(ev.createdAt).toEqual(new Date(NOW));
    expect(events.rows, "the event must be saved via EventRepository.insert").toHaveLength(1);
  });

  it("rejects events that don't start in the future (per the injected clock)", async () => {
    const { service, events } = setup();
    await expect(
      service.create({ title: "Past", capacity: 5, startsAt: new Date(NOW) }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(events.rows).toHaveLength(0);
  });

  it("rejects a capacity below 1 even if the caller skipped HTTP validation", async () => {
    const { service } = setup();
    await expect(
      service.create({ title: "Empty", capacity: 0, startsAt: new Date("2030-02-01T00:00:00Z") }),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

describe("EventService.get / list", () => {
  it("computes seatsTaken, seatsLeft and waitlistCount from the RSVPs", async () => {
    const { service, events, rsvps } = setup();
    const ev = makeEvent({ id: "evt_a", capacity: 10 });
    events.rows.push(ev);
    seedRsvp(rsvps, ev.id, 3, "confirmed");
    seedRsvp(rsvps, ev.id, 2, "confirmed");
    seedRsvp(rsvps, ev.id, 4, "cancelled");
    seedRsvp(rsvps, ev.id, 6, "waitlisted");
    seedRsvp(rsvps, "evt_other", 5, "confirmed");

    const got = await service.get(ev.id);
    expect(got).toMatchObject({ seatsTaken: 5, seatsLeft: 5, waitlistCount: 1 });
  });

  it("throws EventNotFoundError for an unknown id", async () => {
    const { service } = setup();
    await expect(service.get("evt_missing")).rejects.toBeInstanceOf(EventNotFoundError);
  });

  it("lists events by start time, soonest first", async () => {
    const { service, events } = setup();
    events.rows.push(makeEvent({ id: "late", startsAt: new Date("2030-09-01T00:00:00Z") }));
    events.rows.push(makeEvent({ id: "soon", startsAt: new Date("2030-03-01T00:00:00Z") }));
    const list = await service.list();
    expect(list.map((e) => e.id)).toEqual(["soon", "late"]);
  });
});

describe("EventService.update", () => {
  it("renames an event and persists the change", async () => {
    const { service, events } = setup();
    events.rows.push(makeEvent({ id: "evt_a" }));
    const { event } = await service.update("evt_a", { title: "New name" });
    expect(event.title).toBe("New name");
    expect(events.rows[0]?.title, "save the change via EventRepository.update").toBe("New name");
  });

  it("raising capacity promotes the waitlist first-come, first-served", async () => {
    const { service, events, rsvps } = setup();
    events.rows.push(makeEvent({ id: "evt_a", capacity: 2 }));
    seedRsvp(rsvps, "evt_a", 2, "confirmed");
    const first = seedRsvp(rsvps, "evt_a", 1, "waitlisted");
    const second = seedRsvp(rsvps, "evt_a", 1, "waitlisted");

    const { event, promoted } = await service.update("evt_a", { capacity: 3 });

    expect(promoted.map((r) => r.id), "the first one in line gets the new seat").toEqual([first.id]);
    expect(rsvps.statusOf(first.id)).toBe("confirmed");
    expect(rsvps.statusOf(second.id)).toBe("waitlisted");
    expect(event).toMatchObject({ capacity: 3, seatsTaken: 3, seatsLeft: 0, waitlistCount: 1 });
    expect(events.rows[0]?.capacity).toBe(3);
  });

  it("refuses to drop capacity below the confirmed seats", async () => {
    const { service, events, rsvps } = setup();
    events.rows.push(makeEvent({ id: "evt_a", capacity: 10 }));
    seedRsvp(rsvps, "evt_a", 4, "confirmed");
    await expect(service.update("evt_a", { capacity: 3 })).rejects.toBeInstanceOf(CapacityTooLowError);
    await expect(service.update("evt_a", { capacity: 4 })).resolves.toBeDefined();
  });

  it("refuses changes once the event has started", async () => {
    const { service, events, clock } = setup();
    const ev = makeEvent({ id: "evt_a" });
    events.rows.push(ev);
    clock.set(new Date(ev.startsAt.getTime() + 60_000).toISOString());
    await expect(service.update("evt_a", { title: "Too late" })).rejects.toBeInstanceOf(EventAlreadyStartedError);
  });

  it("throws EventNotFoundError for an unknown id", async () => {
    const { service } = setup();
    await expect(service.update("evt_missing", { title: "x" })).rejects.toBeInstanceOf(EventNotFoundError);
  });
});
