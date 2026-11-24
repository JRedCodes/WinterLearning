# Challenge · Untangle the RSVP Service

**Type:** 🐛 Debug / refactor · **Est:** 4–5h · **Services:** none

## Scenario

> **#events-backend** · *Marco (staff engineer):* The RSVP service is now a 360-line `app.ts`, and every change breaks something else. We're moving it to Postgres next quarter and adding a Kafka consumer that creates RSVPs from partner sites. Neither is possible while all the logic is welded to Express handlers. Can you split it into proper layers? The HTTP tests describe what the frontend depends on, so keep them green. I've added unit and architecture tests for the target design. They're red right now.
>
> Also, support forwarded two tickets that I suspect are the same mess:
>
> 🎫 **SUP-311:** "Our workshop had exactly 2 seats left. I booked for me + 1 and got *waitlisted*. The page still says 2 seats left."
>
> 🎫 **SUP-318:** "I joined the waitlist on Monday, my colleague joined on Wednesday. Someone cancelled and *she* got the seat. Same thing happened when the organizer added seats."

There are **2 business-rule bugs**. Your new service unit tests will expose them once the logic lives in a service. The HTTP tests don't cover these cases, which is exactly why they went unnoticed.

## Your task

1. **Read `src/app.ts`** and list the concerns tangled in it (HTTP, validation, rules, storage, config, errors). Read [docs/refactoring-a-god-file.md](docs/refactoring-a-god-file.md) for a safe order of operations.
2. **Refactor into the target structure below**, keeping `test/http.test.ts` green after every step.
3. **Make the architecture, wiring, service and config tests pass.**
4. **Fix the two bugs** (SUP-311, SUP-318) in the service/domain layer, where they now have one obvious home.

### Target structure

```
src/
  app.ts                         createApp(deps: AppDeps): wires middleware + routers. ≤ 80 lines. Builds nothing.
  server.ts                      composition root: loadConfig() → createContainer({ config }) → createApp → listen
  container.ts                   createContainer(overrides?) → AppDeps. The only place that `new`s concrete classes.
  config.ts                      loadConfig(env = process.env): Config. The ONLY file that reads process.env.
  domain/
    event.ts                     Event, EventWithStats (+ pure helpers, your choice)
    rsvp.ts                      Rsvp, RsvpStatus (+ pure helpers: seat math, waitlist selection…)
    errors.ts                    DomainError + subclasses (no HTTP status codes!)
  repositories/
    eventRepository.ts           interface EventRepository
    rsvpRepository.ts            interface RsvpRepository
    (in-memory implementations, any file names)
  services/
    eventService.ts              class EventService
    rsvpService.ts               class RsvpService
  controllers/                   parse input shape → call service → map to DTO
  routes/                        method + path → controller
  middleware/
    errorHandler.ts              maps DomainError → HTTP status + { error: { code, message } }
  lib/
    clock.ts                     interface Clock { now(): Date }
    ids.ts                       type IdGenerator = (prefix: string) => string
```

### Contracts the tests rely on

Copy these signatures exactly. Everything else (helpers, file splits, private methods) is your call.

```ts
// domain/event.ts
export interface Event { id: string; title: string; capacity: number; startsAt: Date; createdAt: Date }
export interface EventWithStats extends Event { seatsTaken: number; seatsLeft: number; waitlistCount: number }

// domain/rsvp.ts
export type RsvpStatus = "confirmed" | "waitlisted" | "cancelled";
export interface Rsvp {
  id: string; eventId: string; name: string; email: string; partySize: number;
  status: RsvpStatus; createdAt: Date; cancelledAt: Date | null;
}

// domain/errors.ts — every class has a readonly `code` and extends DomainError
ValidationError(message: string)          code "VALIDATION_ERROR"   → 400
EventNotFoundError(eventId: string)       code "EVENT_NOT_FOUND"    → 404
RsvpNotFoundError(rsvpId: string)         code "RSVP_NOT_FOUND"     → 404
EventAlreadyStartedError(eventId: string) code "EVENT_STARTED"      → 409
AlreadyRsvpedError(email: string)         code "ALREADY_RSVPED"     → 409
CapacityTooLowError(confirmedSeats: number) code "CAPACITY_TOO_LOW" → 409

// repositories/eventRepository.ts
export interface EventRepository {
  insert(event: Event): Promise<void>;
  update(event: Event): Promise<void>;
  findById(id: string): Promise<Event | undefined>;
  list(): Promise<Event[]>;
}

// repositories/rsvpRepository.ts
export interface RsvpRepository {
  insert(rsvp: Rsvp): Promise<void>;
  update(rsvp: Rsvp): Promise<void>;
  listByEvent(eventId: string): Promise<Rsvp[]>; // all statuses, OLDEST FIRST
}

// lib/clock.ts, lib/ids.ts
export interface Clock { now(): Date }
export type IdGenerator = (prefix: string) => string; // ids("rsvp") → "rsvp_…"

// services/eventService.ts
export class EventService {
  constructor(deps: { events: EventRepository; rsvps: RsvpRepository; clock: Clock; ids: IdGenerator });
  create(input: { title: string; capacity: number; startsAt: Date }): Promise<EventWithStats>;
  list(): Promise<EventWithStats[]>;                         // sorted by startsAt
  get(id: string): Promise<EventWithStats>;
  update(id: string, patch: { title?: string; capacity?: number }):
    Promise<{ event: EventWithStats; promoted: Rsvp[] }>;
}

// services/rsvpService.ts
export class RsvpService {
  constructor(deps: { events: EventRepository; rsvps: RsvpRepository; clock: Clock; ids: IdGenerator; maxPartySize: number });
  create(eventId: string, input: { name: string; email: string; partySize: number }): Promise<Rsvp>;
  listForEvent(eventId: string): Promise<Rsvp[]>;            // active only, oldest first
  cancel(eventId: string, rsvpId: string): Promise<{ cancelled: Rsvp; promoted: Rsvp[] }>;
}

// config.ts
export interface Config { port: number; maxPartySize: number }
export function loadConfig(env?: Record<string, string | undefined>): Config; // defaults 3000 / 6; throws naming the bad variable

// app.ts
export interface AppDeps { eventService: EventService; rsvpService: RsvpService }
export function createApp(deps: AppDeps): Express;

// container.ts
export function createContainer(overrides?: { config?: Config; clock?: Clock; ids?: IdGenerator }): AppDeps;
```

**Where does each rule go?** Shape checks (is `capacity` an integer, is `email` email-like, does `startsAt` parse) belong in the controller. Business rules (capacity ≥ 1, `startsAt` in the future, party size 1…`maxPartySize`, event not started, no duplicate active email, seat math, waitlist promotion) belong in the services/domain. The unit tests call services directly, so a rule that only exists in a controller will fail them.

## Acceptance criteria

- [ ] `test/http.test.ts`: all existing HTTP behavior unchanged (green before and after)
- [ ] `test/architecture.test.ts`: target files exist; `app.ts` ≤ 80 lines and no file > 200 lines; domain imports nothing outward; services and repositories don't import Express or web code; controllers don't import repositories; no HTTP status codes in domain/services; `process.env` only in `config.ts`
- [ ] `test/wiring.test.ts`: `createApp(deps)` uses injected services; controllers validate shape before calling services and pass a `Date`; domain errors map to the right statuses; unexpected errors become a logged generic 500; each `createContainer()` is isolated; config and clock overrides reach the services
- [ ] `test/rsvpService.test.ts` and `test/eventService.test.ts`: business rules work with fake repositories and a fake clock, **including the SUP-311 and SUP-318 fixes**
- [ ] `test/config.test.ts`: `loadConfig(env)` has defaults, parses values, and fails fast with the variable's name
- [ ] `npm test` and `npm run typecheck` pass

## Getting started

```bash
cd 06-layered-architecture/challenge
make install
make test                       # HTTP tests green, everything else red
npx vitest run test/http.test.ts   # your safety net: run it after every step
npm run test:watch              # rerun on save while you work
```

## Rules

- Don't modify anything in `test/`. The fakes in `test/support/fakes.ts` show you the interfaces they expect.
- No new dependencies. No DI container library: wire by hand in `container.ts`.
- Behavior-preserving steps first, bug fixes as separate steps (and separate commits).
- No module-level mutable state anywhere in `src/`.

## Stretch goals

1. Write a **repository contract test**: one `describe` block that runs against your `InMemoryRsvpRepository` *and* the test fake. Module 13 adds a Postgres implementation to the same suite.
2. Convert one service to the **factory-function** style and compare the ergonomics with the class version.
3. Add `GET /events/:id/rsvps?status=waitlisted`. Notice which layers you touch, and which you don't.
4. Reorganize into **feature folders** (`src/events/`, `src/rsvps/`) and adjust nothing but import paths. Do the architecture tests still make sense? What would you change in them?
5. Write a tiny CLI (`src/cli.ts`) that cancels an RSVP using the same container. Zero business logic should be duplicated.

## Done?

1. `npm test` is green and `npm run typecheck` is clean.
2. Commit on your branch `module/06-layered-architecture` (several small commits tell the story of the refactor best), push and open a PR. CI runs this module's tests.
3. From the repo root: `npm run progress -- 06` to tick it off on the roadmap.
4. Answer the questions in [INTERVIEW.md](INTERVIEW.md).
5. Add an entry to [LOG.md](../LOG.md): which smell surprised you most?
6. Compare with the reference solution: `git diff main origin/solutions -- 06-layered-architecture/` (and read `SOLUTION.md` on that branch).

Stuck? → [HINTS.md](HINTS.md)
