# Layering cheat sheet

## Where does this code go?

| If the code… | It goes in | Example |
|---|---|---|
| maps a method + path to a function | `routes/` | `router.post("/:id/rsvps", rsvps.create)` |
| reads `req`, writes `res`, picks a success status | `controllers/` | `res.status(201).json({ data: toRsvpDto(r) })` |
| checks the **shape** of untrusted input | `controllers/` (module 07: validation middleware) | "capacity is an integer" |
| converts entities ↔ JSON | `controllers/dto.ts` | `createdAt.toISOString()` |
| is one user-facing use case | `services/` | `RsvpService.cancel()` |
| enforces a **business rule** that needs state, time or config | `services/` | "event hasn't started", "party ≤ max" |
| is a pure rule about domain objects | `domain/` | `fits(capacity, taken, partySize)` |
| names a business failure | `domain/errors.ts` | `AlreadyRsvpedError` |
| maps errors to HTTP statuses | `middleware/errorHandler.ts` | `EVENT_STARTED → 409` |
| stores/loads data | `repositories/` | `listByEvent(eventId)` |
| reads `process.env` | `config.ts` only | `loadConfig(env)` |
| creates concrete classes and wires them | `container.ts` / `server.ts` | `new RsvpService({ … })` |
| is generic plumbing with no business meaning | `lib/` | `Clock`, `IdGenerator` |

## Who may import whom

```
routes ──▶ controllers ──▶ services ──▶ domain
                              │
                              └──▶ repositories (interfaces) ──▶ domain
repositories (implementations) ──▶ repositories (interfaces)
container / server ──▶ everything (and nothing imports them)
```

- `domain/` imports nothing outside `domain/`.
- `services/` never import `express`, controllers, routes or middleware.
- `controllers/` never import repositories.
- Only `config.ts` mentions `process.env`.

## Layer signatures

```ts
// domain
export function fits(capacity: number, taken: number, partySize: number): boolean;

// repository port
export interface RsvpRepository { listByEvent(eventId: string): Promise<Rsvp[]>; insert(r: Rsvp): Promise<void>; update(r: Rsvp): Promise<void> }

// service
export class RsvpService { constructor(deps: RsvpServiceDeps); create(eventId: string, input: NewRsvpInput): Promise<Rsvp> }

// controller
export function createRsvpController(rsvps: RsvpService): { create: RequestHandler; list: RequestHandler; cancel: RequestHandler };

// app
export function createApp(deps: AppDeps): express.Express;

// composition
export function createContainer(overrides?: ContainerOverrides): AppDeps;
```

## Testing per layer

| Layer | Test with | Doubles |
|---|---|---|
| domain | plain unit tests | none |
| services | unit tests | fake repositories, fake clock, sequential ids |
| controllers/routes | supertest on `createApp(deps)` | fake services |
| repositories | contract tests | real storage |
| whole app | supertest on `createApp(createContainer())` | none (or edge overrides) |

## Review checklist

- [ ] Controller functions ≤ ~15 lines: parse → one service call → respond
- [ ] No `req`, `res`, status codes or `process.env` in services
- [ ] Each business rule exists exactly once
- [ ] Services get every dependency through the constructor
- [ ] No module-level mutable state
- [ ] Responses built from DTO mappers, never raw entities
- [ ] New domain error added → mapped in the error handler
