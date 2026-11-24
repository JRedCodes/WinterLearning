# Hints · Layered Architecture

Open one hint at a time. Give each a real try before opening the next.

## Getting started: where do I even begin?

<details><summary>Hint 1</summary>

Don't start with folders. Start with the **domain**: types and pure functions that need nothing (no Express, no Map, no clock). They're the easiest to extract, and everything else will depend on them.
</details>

<details><summary>Hint 2</summary>

A workable order: `domain/` types + errors → `lib/clock.ts`, `lib/ids.ts` → repository interfaces + in-memory classes → services (make the service tests pass) → error handler → controllers + routes → `createApp(deps)` → `container.ts` → `config.ts` → `server.ts`. Run `npx vitest run test/http.test.ts` after each one.
</details>

<details><summary>Hint 3</summary>

You don't have to keep the god file working while you build the new structure next to it. A practical trick: build the new layers under `src/` while the old `app.ts` still serves requests, get the service tests green, then rewrite `app.ts` in one go to use the new controllers. The HTTP tests tell you immediately if anything changed.
</details>

## Repositories

<details><summary>Hint 1</summary>

Look at `test/support/fakes.ts`. It's a complete implementation of both repository interfaces. Yours can look almost identical, just with a `Map` instead of an array.
</details>

<details><summary>Hint 2</summary>

The god file mutates objects in place (`rsvp.status = "cancelled"`) and never "saves". Behind a repository that copies data (like the fakes do), you must build the changed object and call `update()`. Otherwise the change is lost, and the service tests will tell you so.
</details>

## Services

<details><summary>Hint 1</summary>

A service method should read like the use case: find the event (or throw), check rules (or throw), compute, save, return. No `res`, no status numbers. Every `sendError(res, 409, "X", …)` in the god file becomes `throw new SomethingError(…)`.
</details>

<details><summary>Hint 2</summary>

Both `RsvpService.cancel` and `EventService.update` (when capacity grows) need "promote people from the waitlist". Write that logic **once**: a pure domain function that takes the RSVP list (oldest first) and a capacity and returns who gets promoted, plus a small helper that persists the promotions.
</details>

<details><summary>Hint 3</summary>

Service skeleton:

```ts
export class RsvpService {
  readonly #deps: RsvpServiceDeps;
  constructor(deps: RsvpServiceDeps) { this.#deps = deps; }

  async create(eventId: string, input: NewRsvpInput): Promise<Rsvp> {
    // 1. partySize within 1..maxPartySize, else ValidationError
    // 2. event = await events.findById(eventId) ?? throw EventNotFoundError
    // 3. started? (compare event.startsAt with clock.now()) → EventAlreadyStartedError
    // 4. list = await rsvps.listByEvent(eventId); active duplicate email? → AlreadyRsvpedError
    // 5. status = fits(...) ? "confirmed" : "waitlisted"; insert; return
  }
}
```
</details>

## The two bugs (SUP-311, SUP-318)

<details><summary>Hint 1</summary>

Once all the seat logic is in one place, compare how "does this party fit?" was written in the *three* places it appeared in the god file. Do they agree?
</details>

<details><summary>Hint 2</summary>

For SUP-318: what order does the waitlist loop take people out of the array? Think about what `Array.prototype.pop()` returns.
</details>

<details><summary>Hint 3</summary>

SUP-311: a party fits when `taken + partySize <= capacity`, so filling the last seat exactly is allowed. SUP-318: walk waitlisted RSVPs from the **front** (oldest first), promote while the next one fits, and `break` at the first one that doesn't.
</details>

## Errors

<details><summary>Hint 1</summary>

Give `DomainError` an abstract `code` property. The error handler only has to check `err instanceof DomainError` and look up a status by `err.code`.
</details>

<details><summary>Hint 2</summary>

Type the codes as a union (`type DomainErrorCode = "VALIDATION_ERROR" | …`) and write the status table as `{ … } satisfies Record<DomainErrorCode, number>`. Then TypeScript won't let you forget a mapping.
</details>

## Controllers, app and container

<details><summary>Hint 1</summary>

The wiring test checks that `EventService.create` receives `{ title, capacity, startsAt: Date }`: trimmed title, a number, and a real `Date`. Parsing the string into a `Date` is the controller's job. Deciding whether the date is in the future is the service's job.
</details>

<details><summary>Hint 2</summary>

Controllers as factories: `createEventController(service)` returns `{ create, list, get, update }`, each an `async (req, res) => {}`. A router factory takes `{ eventService, rsvpService }`, builds the controllers and maps paths. `createApp(deps)` just mounts that router at `/events`.
</details>

<details><summary>Hint 3</summary>

`createContainer` in full pseudo-code:

```
config = overrides.config ?? loadConfig()
clock  = overrides.clock  ?? systemClock
ids    = overrides.ids    ?? randomId
events = new InMemoryEventRepository(); rsvps = new InMemoryRsvpRepository()
return { eventService: new EventService({...}), rsvpService: new RsvpService({..., maxPartySize: config.maxPartySize}) }
```

Because the repositories are created *inside* the function, every call gets its own state, and the isolation test passes.
</details>

## Config

<details><summary>Hint 1</summary>

`loadConfig(env = process.env)`: the default parameter is the only place `process.env` appears. Tests pass their own object.
</details>

<details><summary>Hint 2</summary>

Check with `/^\d+$/` before `Number()` (remember module 05: `Number("2.5")` and `Number("")` aren't what you want), then range-check. Throw `new Error("Invalid MAX_PARTY_SIZE: …")` so the message names the variable.
</details>
