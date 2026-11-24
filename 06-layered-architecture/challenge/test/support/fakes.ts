/**
 * Test doubles for the service unit tests.
 *
 * These implement the repository INTERFACES from src/repositories, which is the
 * whole point: the service must not care whether it talks to a Map, Postgres or
 * this fake.
 *
 * The fakes copy entities on the way in and out (structuredClone), just like a
 * real database would. A service that mutates an entity but forgets to call
 * `update()` will therefore NOT see its change persisted. That's deliberate.
 */
import type { Event } from "../../src/domain/event.js";
import type { Rsvp } from "../../src/domain/rsvp.js";
import type { EventRepository } from "../../src/repositories/eventRepository.js";
import type { RsvpRepository } from "../../src/repositories/rsvpRepository.js";
import type { Clock } from "../../src/lib/clock.js";
import type { IdGenerator } from "../../src/lib/ids.js";

export class FakeEventRepository implements EventRepository {
  readonly rows: Event[] = [];

  async insert(event: Event): Promise<void> {
    this.rows.push(structuredClone(event));
  }

  async update(event: Event): Promise<void> {
    const i = this.rows.findIndex((e) => e.id === event.id);
    if (i === -1) throw new Error(`FakeEventRepository.update: no event ${event.id}`);
    this.rows[i] = structuredClone(event);
  }

  async findById(id: string): Promise<Event | undefined> {
    const found = this.rows.find((e) => e.id === id);
    return found ? structuredClone(found) : undefined;
  }

  async list(): Promise<Event[]> {
    return this.rows.map((e) => structuredClone(e));
  }
}

export class FakeRsvpRepository implements RsvpRepository {
  readonly rows: Rsvp[] = [];

  async insert(rsvp: Rsvp): Promise<void> {
    this.rows.push(structuredClone(rsvp));
  }

  async update(rsvp: Rsvp): Promise<void> {
    const i = this.rows.findIndex((r) => r.id === rsvp.id);
    if (i === -1) throw new Error(`FakeRsvpRepository.update: no rsvp ${rsvp.id}`);
    this.rows[i] = structuredClone(rsvp);
  }

  /** Oldest first: insertion order, exactly as the interface promises. */
  async listByEvent(eventId: string): Promise<Rsvp[]> {
    return this.rows.filter((r) => r.eventId === eventId).map((r) => structuredClone(r));
  }

  statusOf(id: string): string | undefined {
    return this.rows.find((r) => r.id === id)?.status;
  }
}

/** A clock the test controls. */
export class FakeClock implements Clock {
  #now: Date;
  constructor(iso: string) {
    this.#now = new Date(iso);
  }
  now(): Date {
    return new Date(this.#now);
  }
  set(iso: string): void {
    this.#now = new Date(iso);
  }
}

/** Predictable ids: evt_1, rsvp_2, ... */
export function sequentialIds(): IdGenerator {
  let n = 0;
  return (prefix: string) => `${prefix}_${++n}`;
}

export function makeEvent(overrides: Partial<Event> = {}): Event {
  return {
    id: "evt_test",
    title: "Rooftop meetup",
    capacity: 10,
    startsAt: new Date("2030-06-01T18:00:00.000Z"),
    createdAt: new Date("2030-01-01T00:00:00.000Z"),
    ...overrides,
  };
}
