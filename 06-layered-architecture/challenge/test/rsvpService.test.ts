/**
 * Unit tests for the RSVP business rules, with NO HTTP and NO Express.
 *
 * The service gets fake repositories, a fake clock and predictable ids through
 * its constructor. If you find yourself needing supertest here, the logic is
 * still in the wrong layer.
 */
import { describe, expect, it } from "vitest";
import { RsvpService } from "../src/services/rsvpService.js";
import {
  AlreadyRsvpedError,
  EventAlreadyStartedError,
  EventNotFoundError,
  RsvpNotFoundError,
  ValidationError,
} from "../src/domain/errors.js";
import { FakeClock, FakeEventRepository, FakeRsvpRepository, makeEvent, sequentialIds } from "./support/fakes.js";

const NOW = "2030-01-01T12:00:00.000Z";

function setup(opts: { capacity?: number; maxPartySize?: number } = {}) {
  const events = new FakeEventRepository();
  const rsvps = new FakeRsvpRepository();
  const clock = new FakeClock(NOW);
  const event = makeEvent({ capacity: opts.capacity ?? 10 });
  events.rows.push(event);
  const service = new RsvpService({
    events,
    rsvps,
    clock,
    ids: sequentialIds(),
    maxPartySize: opts.maxPartySize ?? 6,
  });
  return { service, events, rsvps, clock, event };
}

const guest = (name: string, partySize = 1) => ({
  name,
  email: `${name.toLowerCase()}@example.com`,
  partySize,
});

describe("RsvpService.create", () => {
  it("confirms an RSVP when seats are free and stores it through the repository", async () => {
    const { service, rsvps, event } = setup();
    const rsvp = await service.create(event.id, guest("Ana", 2));
    expect(rsvp).toMatchObject({
      id: "rsvp_1",
      eventId: event.id,
      name: "Ana",
      email: "ana@example.com",
      partySize: 2,
      status: "confirmed",
      cancelledAt: null,
    });
    expect(rsvp.createdAt).toEqual(new Date(NOW));
    expect(rsvps.rows, "the RSVP must be saved via RsvpRepository.insert").toHaveLength(1);
  });

  it("trims the name and normalizes the email", async () => {
    const { service, event } = setup();
    const rsvp = await service.create(event.id, { name: "  Ana ", email: " Ana@Example.COM ", partySize: 1 });
    expect(rsvp.name).toBe("Ana");
    expect(rsvp.email).toBe("ana@example.com");
  });

  it("confirms a party that exactly fills the remaining seats", async () => {
    const { service, event } = setup({ capacity: 4 });
    await service.create(event.id, guest("Ana", 2));
    const last = await service.create(event.id, guest("Ben", 2));
    expect(last.status, "2 seats left and a party of 2 should fit").toBe("confirmed");
  });

  it("waitlists a party that does not fit", async () => {
    const { service, event } = setup({ capacity: 4 });
    await service.create(event.id, guest("Ana", 3));
    const rsvp = await service.create(event.id, guest("Ben", 2));
    expect(rsvp.status).toBe("waitlisted");
  });

  it("enforces the injected maxPartySize and stores nothing on failure", async () => {
    const { service, rsvps, event } = setup({ maxPartySize: 2 });
    await expect(service.create(event.id, guest("Ana", 3))).rejects.toBeInstanceOf(ValidationError);
    expect(rsvps.rows).toHaveLength(0);
    await expect(service.create(event.id, guest("Ben", 2))).resolves.toMatchObject({ status: "confirmed" });
  });

  it("rejects a second active RSVP for the same email, case-insensitively", async () => {
    const { service, event } = setup();
    await service.create(event.id, guest("Ana"));
    await expect(
      service.create(event.id, { name: "Ana 2", email: "ANA@example.com", partySize: 1 }),
    ).rejects.toBeInstanceOf(AlreadyRsvpedError);
  });

  it("allows the same email again after the first RSVP was cancelled", async () => {
    const { service, event } = setup();
    const first = await service.create(event.id, guest("Ana"));
    await service.cancel(event.id, first.id);
    await expect(service.create(event.id, guest("Ana"))).resolves.toMatchObject({ status: "confirmed" });
  });

  it("throws EventNotFoundError for an unknown event", async () => {
    const { service } = setup();
    await expect(service.create("evt_missing", guest("Ana"))).rejects.toBeInstanceOf(EventNotFoundError);
  });

  it("refuses RSVPs once the event has started (uses the injected clock)", async () => {
    const { service, clock, event } = setup();
    clock.set(event.startsAt.toISOString());
    await expect(service.create(event.id, guest("Ana"))).rejects.toBeInstanceOf(EventAlreadyStartedError);
  });
});

describe("RsvpService.listForEvent", () => {
  it("returns active RSVPs oldest first, without cancelled ones", async () => {
    const { service, event } = setup();
    const a = await service.create(event.id, guest("Ana"));
    const b = await service.create(event.id, guest("Ben"));
    const c = await service.create(event.id, guest("Cy"));
    await service.cancel(event.id, b.id);
    const list = await service.listForEvent(event.id);
    expect(list.map((r) => r.id)).toEqual([a.id, c.id]);
  });

  it("throws EventNotFoundError for an unknown event", async () => {
    const { service } = setup();
    await expect(service.listForEvent("evt_missing")).rejects.toBeInstanceOf(EventNotFoundError);
  });
});

describe("RsvpService.cancel", () => {
  it("marks the RSVP cancelled, stamps cancelledAt from the clock and persists it", async () => {
    const { service, rsvps, clock, event } = setup();
    const a = await service.create(event.id, guest("Ana"));
    clock.set("2030-01-02T08:00:00.000Z");
    const { cancelled, promoted } = await service.cancel(event.id, a.id);
    expect(cancelled).toMatchObject({ id: a.id, status: "cancelled" });
    expect(cancelled.cancelledAt).toEqual(new Date("2030-01-02T08:00:00.000Z"));
    expect(promoted).toEqual([]);
    expect(rsvps.statusOf(a.id), "save the change via RsvpRepository.update").toBe("cancelled");
  });

  it("promotes the waitlist first-come, first-served", async () => {
    const { service, rsvps, event } = setup({ capacity: 2 });
    const big = await service.create(event.id, guest("Big", 2));
    const a = await service.create(event.id, guest("Ana"));
    const b = await service.create(event.id, guest("Ben"));
    const c = await service.create(event.id, guest("Cy"));
    expect([a.status, b.status, c.status]).toEqual(["waitlisted", "waitlisted", "waitlisted"]);

    const { promoted } = await service.cancel(event.id, big.id);

    expect(promoted.map((r) => r.name), "Ana and Ben joined the waitlist first").toEqual(["Ana", "Ben"]);
    expect(rsvps.statusOf(a.id)).toBe("confirmed");
    expect(rsvps.statusOf(b.id)).toBe("confirmed");
    expect(rsvps.statusOf(c.id)).toBe("waitlisted");
  });

  it("never lets a smaller party jump the line", async () => {
    const { service, rsvps, event } = setup({ capacity: 3 });
    await service.create(event.id, guest("Xia", 2));
    const yan = await service.create(event.id, guest("Yan", 1));
    const big = await service.create(event.id, guest("Big", 3)); // first in line, needs 3
    const small = await service.create(event.id, guest("Sol", 1)); // second in line, needs 1

    const { promoted } = await service.cancel(event.id, yan.id); // frees 1 seat

    expect(promoted).toEqual([]);
    expect(rsvps.statusOf(big.id)).toBe("waitlisted");
    expect(rsvps.statusOf(small.id)).toBe("waitlisted");
  });

  it("does not promote anyone when a waitlisted RSVP is cancelled", async () => {
    const { service, event } = setup({ capacity: 1 });
    await service.create(event.id, guest("Ana", 1));
    const ben = await service.create(event.id, guest("Ben", 1));
    await service.create(event.id, guest("Cy", 1));
    const { promoted } = await service.cancel(event.id, ben.id);
    expect(promoted).toEqual([]);
  });

  it("throws RsvpNotFoundError for unknown, already-cancelled, or other-event RSVPs", async () => {
    const { service, events, event } = setup();
    const other = makeEvent({ id: "evt_other" });
    events.rows.push(other);
    const a = await service.create(event.id, guest("Ana"));
    const o = await service.create(other.id, guest("Olu"));

    await expect(service.cancel(event.id, "rsvp_missing")).rejects.toBeInstanceOf(RsvpNotFoundError);
    await expect(service.cancel(event.id, o.id)).rejects.toBeInstanceOf(RsvpNotFoundError);
    await service.cancel(event.id, a.id);
    await expect(service.cancel(event.id, a.id)).rejects.toBeInstanceOf(RsvpNotFoundError);
  });

  it("throws EventNotFoundError for an unknown event", async () => {
    const { service } = setup();
    await expect(service.cancel("evt_missing", "rsvp_1")).rejects.toBeInstanceOf(EventNotFoundError);
  });
});
