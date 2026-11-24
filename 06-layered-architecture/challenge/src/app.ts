// =============================================================================
//  RSVP service: everything lives here. It works, so nobody touched it.
//
//  Original author: "temporary, will split this up after the launch" (2 launches ago)
// =============================================================================
import express, { type NextFunction, type Request, type Response } from "express";
import { randomUUID } from "node:crypto";

// -----------------------------------------------------------------------------
// Storage. "We'll move to Postgres later."
// -----------------------------------------------------------------------------

type RsvpStatus = "confirmed" | "waitlisted" | "cancelled";

interface EventRecord {
  id: string;
  title: string;
  capacity: number;
  startsAt: string; // ISO string
  createdAt: string;
}

interface RsvpRecord {
  id: string;
  eventId: string;
  name: string;
  email: string;
  partySize: number;
  status: RsvpStatus;
  createdAt: string;
  cancelledAt?: string;
}

// Module-level state: shared by every app instance created in this process.
const events = new Map<string, EventRecord>();
const rsvpsByEvent = new Map<string, RsvpRecord[]>();

function newId(prefix: string) {
  return `${prefix}_${randomUUID().slice(0, 8)}`;
}

function sendError(res: Response, status: number, code: string, message: string) {
  res.status(status).json({ error: { code, message } });
}

// -----------------------------------------------------------------------------
// Helpers that grew over time
// -----------------------------------------------------------------------------

// Builds the event JSON the frontend wants. Counts seats on the fly.
function eventToJson(ev: EventRecord) {
  const list = rsvpsByEvent.get(ev.id) ?? [];
  let taken = 0;
  let waiting = 0;
  for (const r of list) {
    if (r.status === "confirmed") taken += r.partySize;
    if (r.status === "waitlisted") waiting += 1;
  }
  return {
    id: ev.id,
    title: ev.title,
    capacity: ev.capacity,
    startsAt: ev.startsAt,
    createdAt: ev.createdAt,
    seatsTaken: taken,
    seatsLeft: ev.capacity - taken,
    waitlistCount: waiting,
  };
}

function rsvpToJson(r: RsvpRecord) {
  return {
    id: r.id,
    eventId: r.eventId,
    name: r.name,
    email: r.email,
    partySize: r.partySize,
    status: r.status,
    createdAt: r.createdAt,
  };
}

// Adds an RSVP and writes the HTTP response itself. Returns false if it already
// responded with an error, true on success. (Yes, really.)
function addRsvp(
  ev: EventRecord,
  input: { name: string; email: string; partySize: number },
  res: Response,
): boolean {
  // Read config on every call so ops can "change it without a deploy".
  const maxParty = Number(process.env.MAX_PARTY_SIZE ?? 6);
  if (input.partySize > maxParty) {
    sendError(res, 400, "VALIDATION_ERROR", `partySize must be at most ${maxParty}`);
    return false;
  }

  if (new Date(ev.startsAt).getTime() <= Date.now()) {
    sendError(res, 409, "EVENT_STARTED", "This event has already started");
    return false;
  }

  const list = rsvpsByEvent.get(ev.id) ?? [];
  const email = input.email.trim().toLowerCase();
  const dupe = list.find((r) => r.email === email && r.status !== "cancelled");
  if (dupe) {
    sendError(res, 409, "ALREADY_RSVPED", "This email already has an RSVP for this event");
    return false;
  }

  // count confirmed seats
  let taken = 0;
  for (const r of list) {
    if (r.status === "confirmed") taken += r.partySize;
  }

  const rsvp: RsvpRecord = {
    id: newId("rsvp"),
    eventId: ev.id,
    name: input.name.trim(),
    email,
    partySize: input.partySize,
    status: taken + input.partySize < ev.capacity ? "confirmed" : "waitlisted",
    createdAt: new Date().toISOString(),
  };
  list.push(rsvp);
  rsvpsByEvent.set(ev.id, list);

  res.status(201).json({ data: rsvpToJson(rsvp) });
  return true;
}

// -----------------------------------------------------------------------------
// The app
// -----------------------------------------------------------------------------

export function createApp(_deps?: unknown) {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "100kb" }));

  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  // ---------------------------------------------------------------- events --

  app.post("/events", (req: Request, res: Response) => {
    const body = req.body ?? {};

    if (typeof body.title !== "string" || body.title.trim().length === 0) {
      return sendError(res, 400, "VALIDATION_ERROR", "title is required");
    }
    if (body.title.trim().length > 200) {
      return sendError(res, 400, "VALIDATION_ERROR", "title must be at most 200 characters");
    }
    if (typeof body.capacity !== "number" || !Number.isInteger(body.capacity)) {
      return sendError(res, 400, "VALIDATION_ERROR", "capacity must be an integer");
    }
    if (body.capacity < 1) {
      return sendError(res, 400, "VALIDATION_ERROR", "capacity must be at least 1");
    }
    if (typeof body.startsAt !== "string" || Number.isNaN(Date.parse(body.startsAt))) {
      return sendError(res, 400, "VALIDATION_ERROR", "startsAt must be an ISO date string");
    }
    if (new Date(body.startsAt).getTime() <= Date.now()) {
      return sendError(res, 400, "VALIDATION_ERROR", "startsAt must be in the future");
    }

    const ev: EventRecord = {
      id: newId("evt"),
      title: body.title.trim(),
      capacity: body.capacity,
      startsAt: new Date(body.startsAt).toISOString(),
      createdAt: new Date().toISOString(),
    };
    events.set(ev.id, ev);
    rsvpsByEvent.set(ev.id, []);

    res.status(201).location(`/events/${ev.id}`).json({ data: eventToJson(ev) });
  });

  app.get("/events", (_req, res) => {
    const list = [...events.values()].sort(
      (a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime(),
    );
    res.json({ data: list.map(eventToJson) });
  });

  app.get("/events/:id", (req, res) => {
    const ev = events.get(req.params.id);
    if (!ev) return sendError(res, 404, "EVENT_NOT_FOUND", "Event not found");
    res.json({ data: eventToJson(ev) });
  });

  // Organizers can rename an event or change its capacity. Raising capacity
  // lets people in from the waitlist.
  app.patch("/events/:id", (req, res) => {
    const ev = events.get(req.params.id);
    if (!ev) return sendError(res, 404, "EVENT_NOT_FOUND", "Event not found");

    const body = req.body ?? {};
    if (body.title === undefined && body.capacity === undefined) {
      return sendError(res, 400, "VALIDATION_ERROR", "provide at least one of: title, capacity");
    }
    if (body.title !== undefined) {
      if (typeof body.title !== "string" || body.title.trim().length === 0) {
        return sendError(res, 400, "VALIDATION_ERROR", "title is required");
      }
      if (body.title.trim().length > 200) {
        return sendError(res, 400, "VALIDATION_ERROR", "title must be at most 200 characters");
      }
    }
    if (body.capacity !== undefined) {
      if (typeof body.capacity !== "number" || !Number.isInteger(body.capacity)) {
        return sendError(res, 400, "VALIDATION_ERROR", "capacity must be an integer");
      }
      if (body.capacity < 1) {
        return sendError(res, 400, "VALIDATION_ERROR", "capacity must be at least 1");
      }
    }

    if (new Date(ev.startsAt).getTime() <= Date.now()) {
      return sendError(res, 409, "EVENT_STARTED", "This event has already started");
    }

    const list = rsvpsByEvent.get(ev.id) ?? [];
    // count confirmed seats
    let taken = 0;
    for (const r of list) {
      if (r.status === "confirmed") taken += r.partySize;
    }

    if (body.capacity !== undefined && body.capacity < taken) {
      return sendError(
        res,
        409,
        "CAPACITY_TOO_LOW",
        `capacity cannot be lower than the ${taken} seats already confirmed`,
      );
    }

    if (body.title !== undefined) ev.title = body.title.trim();
    const promoted: RsvpRecord[] = [];
    if (body.capacity !== undefined) {
      const grew = body.capacity > ev.capacity;
      ev.capacity = body.capacity;
      if (grew) {
        // copied from the cancel handler below, keep them in sync!
        const waitlist = list.filter((r) => r.status === "waitlisted");
        while (waitlist.length > 0) {
          const next = waitlist.pop()!;
          if (taken + next.partySize <= ev.capacity) {
            next.status = "confirmed";
            taken += next.partySize;
            promoted.push(next);
          } else {
            break;
          }
        }
      }
    }

    res.json({ data: { event: eventToJson(ev), promoted: promoted.map(rsvpToJson) } });
  });

  // ----------------------------------------------------------------- rsvps --

  app.post("/events/:id/rsvps", (req, res) => {
    const ev = events.get(req.params.id);
    if (!ev) return sendError(res, 404, "EVENT_NOT_FOUND", "Event not found");

    const body = req.body ?? {};
    if (typeof body.name !== "string" || body.name.trim().length === 0) {
      return sendError(res, 400, "VALIDATION_ERROR", "name is required");
    }
    if (body.name.trim().length > 100) {
      return sendError(res, 400, "VALIDATION_ERROR", "name must be at most 100 characters");
    }
    if (typeof body.email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email.trim())) {
      return sendError(res, 400, "VALIDATION_ERROR", "email must be a valid email address");
    }
    let partySize = 1;
    if (body.partySize !== undefined) {
      if (typeof body.partySize !== "number" || !Number.isInteger(body.partySize)) {
        return sendError(res, 400, "VALIDATION_ERROR", "partySize must be an integer");
      }
      if (body.partySize < 1) {
        return sendError(res, 400, "VALIDATION_ERROR", "partySize must be at least 1");
      }
      partySize = body.partySize;
    }

    addRsvp(ev, { name: body.name, email: body.email, partySize }, res);
  });

  app.get("/events/:id/rsvps", (req, res) => {
    const ev = events.get(req.params.id);
    if (!ev) return sendError(res, 404, "EVENT_NOT_FOUND", "Event not found");
    const list = (rsvpsByEvent.get(ev.id) ?? []).filter((r) => r.status !== "cancelled");
    res.json({ data: list.map(rsvpToJson) });
  });

  app.delete("/events/:id/rsvps/:rsvpId", (req, res) => {
    const ev = events.get(req.params.id);
    if (!ev) return sendError(res, 404, "EVENT_NOT_FOUND", "Event not found");

    const list = rsvpsByEvent.get(ev.id) ?? [];
    const rsvp = list.find((r) => r.id === req.params.rsvpId);
    if (!rsvp || rsvp.status === "cancelled") {
      return sendError(res, 404, "RSVP_NOT_FOUND", "RSVP not found");
    }

    const wasConfirmed = rsvp.status === "confirmed";
    rsvp.status = "cancelled";
    rsvp.cancelledAt = new Date().toISOString();

    const promoted: RsvpRecord[] = [];
    if (wasConfirmed) {
      // count confirmed seats (again)
      let taken = 0;
      for (const r of list) {
        if (r.status === "confirmed") taken += r.partySize;
      }
      // Fill freed seats from the waitlist. Stop at the first party that doesn't
      // fit so nobody can jump the line.
      const waitlist = list.filter((r) => r.status === "waitlisted");
      while (waitlist.length > 0) {
        const next = waitlist.pop()!;
        if (taken + next.partySize <= ev.capacity) {
          next.status = "confirmed";
          taken += next.partySize;
          promoted.push(next);
        } else {
          break;
        }
      }
    }

    res.json({ data: { cancelled: rsvpToJson(rsvp), promoted: promoted.map(rsvpToJson) } });
  });

  // ------------------------------------------------------------ fallbacks --

  app.use((req: Request, res: Response) => {
    sendError(res, 404, "ROUTE_NOT_FOUND", `Cannot ${req.method} ${req.path}`);
  });

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (typeof err === "object" && err !== null && (err as { type?: string }).type === "entity.parse.failed") {
      return sendError(res, 400, "INVALID_JSON", "Request body is not valid JSON");
    }
    console.error(err);
    sendError(res, 500, "INTERNAL_ERROR", "Something went wrong");
  });

  return app;
}
