# Dependency injection without a framework

The lesson's short version is that code should receive its collaborators instead of reaching out for them. This page covers the details you'll run into once you actually do it: the styles of injection, object lifetimes, testing overrides, and when a DI container library starts to pay off.

## 1. Three ways to get a dependency

```ts
// A. Import a module-level singleton (service locator by import)
import { pool } from "../db.js";
export async function getEvent(id: string) { return pool.query(/* … */); }

// B. Look it up at runtime from a registry (service locator)
export async function getEvent(id: string) {
  const repo = registry.get<EventRepository>("eventRepository");
  return repo.findById(id);
}

// C. Receive it (dependency injection)
export class EventService {
  constructor(private readonly deps: { events: EventRepository }) {}
  get(id: string) { return this.deps.events.findById(id); }
}
```

A and B *work*, but the dependency doesn't appear in the signature. To test A you need module mocking (`vi.mock("../db.js")`), which is brittle and global. With B, you find out a registration is missing at runtime. C makes the dependency visible, type-checked and replaceable with nothing more than a function argument.

## 2. Constructor injection vs factory functions

Both are fine. What matters is picking one per kind of thing and sticking to it.

| | Class + constructor | Factory function + closure |
|---|---|---|
| Syntax | `new RsvpService(deps)` | `createRsvpService(deps)` |
| Privacy | `#deps` (runtime private) or `private` (compile-time only) | closure variables are truly private |
| Passing methods as callbacks | loses `this` (`router.get("/", service.list)` breaks) unless you bind or use arrow fields | always safe |
| Type name | the class itself | `ReturnType<typeof createRsvpService>` or a separate interface |
| `instanceof` checks | possible | not possible (rarely needed) |
| Familiar to | Java/C#/NestJS developers | functional-leaning JS developers |

The `this` row is the one that bites. With classes, never hand a method straight to Express. Wrap it in a controller function, as the solution does.

## 3. One deps object, not positional parameters

```ts
// ❌ positional: which number is which? adding one breaks every call site
new RsvpService(events, rsvps, systemClock, randomId, 6);

// ✅ named: self-documenting, order-free, easy to extend
new RsvpService({ events, rsvps, clock: systemClock, ids: randomId, maxPartySize: 6 });
```

Export the deps type (`RsvpServiceDeps`) so tests and the composition root share it.

## 4. Inject values, not the whole config

Give the service `maxPartySize: number`, not `config: Config`. Narrow dependencies:

- document exactly what the service uses
- make tests shorter (no need to build a full config object)
- stop a service from quietly starting to depend on unrelated settings

## 5. Lifetimes

Every object in the graph has a lifetime: how long one instance lives.

| Lifetime | Meaning | Examples |
|---|---|---|
| **Singleton** (per process) | created once at startup, shared by all requests | DB pool, Redis client, repositories, stateless services, logger |
| **Scoped** (per request) | created for one request, discarded after | a request-scoped logger with the request id, a unit of work / transaction |
| **Transient** | new instance every time it's asked for | rarely needed in Node |

Most Node services are made almost entirely of singletons, because they're stateless: the state lives in the database. When you need something per request (module 24's request-scoped logger, module 15's transaction), either create it in middleware and pass it down explicitly, or use `AsyncLocalStorage`.

> ⚠️ **Captive dependency:** a singleton that holds a reference to a per-request object. For example, a service created at startup that stores "the current user" in a field serves user A's data to user B. Keep per-request data in arguments, never in singleton fields.

## 6. Overrides for tests

A composition root that accepts overrides gives you end-to-end tests with controlled edges:

```ts
const clock = new FakeClock("2040-01-01T00:00:00Z");
const app = createApp(createContainer({ clock, config: { port: 0, maxPartySize: 2 } }));
```

Keep overrides limited to true edges of the system (time, ids, config, external services). If tests need to override a service in the middle of the graph, test that layer directly instead.

## 7. When does a DI container pay off?

Container libraries (Awilix, tsyringe, InversifyJS, NestJS's injector) build the graph from registrations or decorators. They help when:

- the graph has hundreds of nodes and many scoped lifetimes
- a framework expects one (NestJS)
- plugins register services dynamically

They cost you: decorators/metadata, runtime resolution errors, and "go to definition" landing in the container instead of the code. For an app with a dozen services, a 30-line `createContainer()` written by hand ("pure DI") is easier to read, fully type-checked, and has no magic. Start there. Reach for a container when the hand-written root becomes genuinely painful, not before.

## 8. Smells

- `new SomethingConcrete()` inside a service or controller → it should be injected.
- A constructor with 8+ dependencies → the class probably does too much. Split it.
- Optional dependencies with silent defaults inside services (`deps.clock ?? systemClock`) → defaults belong in the composition root, so production wiring is visible in one place.
- `vi.mock()` everywhere in tests → dependencies aren't injectable.
