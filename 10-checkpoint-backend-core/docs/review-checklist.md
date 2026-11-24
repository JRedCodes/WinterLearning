# Self-review checklist

Green tests mean the behavior is right. This checklist is about whether the **code** is right: what a senior engineer would look at when reviewing your PR. Go through it before opening yours.

## Architecture

- [ ] `app.ts` only wires things together and sets up middleware; it has no business logic and never calls `listen()`.
- [ ] `server.ts` is the composition root: loads config, picks real implementations (system clock), listens, shuts down gracefully.
- [ ] Services and domain code don't import `express`, `Request` or `Response`, and don't know any HTTP status codes.
- [ ] Repositories only store and retrieve; no business rules like "name must be unique" hide inside them.
- [ ] Dependencies point inward: routes → controllers → services → repositories/domain, never the other way.
- [ ] Every dependency a service needs (repositories, clock, id generator) arrives through its constructor.

## HTTP layer

- [ ] Controllers are thin: parse input → call one service method → shape the response.
- [ ] All input (body, params, query) is validated with zod before reaching a service.
- [ ] Responses are mapped to DTOs; internal fields (like `userId`) aren't leaked.
- [ ] Status codes match the spec: 201 + `Location` for creation, 204 with no body for deletes, 200 vs 201 for the idempotent PUT.
- [ ] Middleware order is deliberate and commented where non-obvious.

## Errors

- [ ] Business failures are domain errors with a closed set of codes (a union type), thrown from services.
- [ ] Exactly one place (the error handler) maps errors to HTTP, ideally with an exhaustive `satisfies Record<Code, number>` map.
- [ ] Unexpected errors return a generic 500 and are logged with the request id; no stack traces or internal messages reach the client.
- [ ] Every error body has the same shape: `{ error: { code, message, requestId, details? } }`.

## Types

- [ ] No `any`. Untrusted data is `unknown` until parsed.
- [ ] Few or no `as` casts; the ones that exist are in small, named functions (e.g. a brand constructor).
- [ ] Types are derived where possible (`z.infer`, `Order["status"]`) instead of duplicated.
- [ ] `res.locals` fields (request id, user id) are typed via declaration merging, not read as `any`.

## Time and data

- [ ] "Now" always comes from the injected clock; no `new Date()` with no arguments in services or domain code.
- [ ] Calendar dates are handled in UTC (`getUTC*`, `toISOString()`), never with local-time methods.
- [ ] Pure logic (streaks, date math) lives in pure functions that are easy to test.
- [ ] In-memory repositories return copies, so callers can't mutate stored state by accident.

## Config

- [ ] `process.env` is read only in `config.ts`, once, at startup.
- [ ] Invalid config fails fast with a message naming every bad variable.
- [ ] Defaults are sensible for local development.

## Code quality

- [ ] Names say what things are (`checkInsLast30Days`, not `count2`).
- [ ] No dead code, commented-out code or leftover `console.log`s.
- [ ] Comments explain *why*, not *what*.
- [ ] Files are small enough to read in one sitting; no 400-line god file.
- [ ] You added at least a few tests of your own (e.g. unit tests for `computeStats`) where the acceptance tests felt thin.

## Before you push

- [ ] `npm test` and `npm run typecheck` are green.
- [ ] `npm run dev` starts, and you've tried a few requests with curl.
- [ ] Your PR description explains the structure and one or two decisions you made, and what you'd do next.
