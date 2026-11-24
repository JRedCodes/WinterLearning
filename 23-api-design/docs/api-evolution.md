# Evolving an API: versioning, compatibility, deprecation

Version 1 is the easy part. This page is about years two to five, when real clients depend on every detail.

## Hyrum's law

> With a sufficient number of users of an API, it does not matter what you promise in the contract: all observable behaviors of your system will be depended on by somebody.

Field order, error message wording, the exact default page size, the fact that ids happen to be sequential: someone relies on it. Two defenses:

1. **Make the contract explicit** (OpenAPI with `required`, enums, formats, documented defaults) so you can point at it.
2. **Don't expose accidental behavior**: opaque ids and cursors, stable error `type`s instead of messages, no undocumented fields.

## Compatibility rules, precisely

Think about two directions:

- **Requests** (client → server): the server must keep accepting what old clients send. You can *relax* (accept more) but not *tighten*.
- **Responses** (server → client): the server must keep sending what old clients need. You can *add* but not *remove or change*.

| Change | Safe? | Why |
|---|---|---|
| Add optional request field with a default that keeps old behavior | ✅ | old clients don't send it |
| Add required request field | ❌ | old clients don't send it → 400 |
| Add response field | ✅* | *if clients ignore unknown fields |
| Remove/rename response field | ❌ | clients reading it get `undefined` |
| Change `"amount": "10.00"` to `"amount": 10` | ❌ | type change |
| Add enum value to a response field | ⚠️ | breaks clients with exhaustive switches unless documented as open-ended |
| Add enum value to a request field | ✅ | old clients never send it |
| Lower a max length / tighten a regex | ❌ | previously valid requests now fail |
| Change default page size | ⚠️ | clients that assumed "everything in one page" break |
| New error `type` for an existing situation | ❌ | clients branching on the old type break |

## Strategies in practice

### URL major versions (`/v1`, `/v2`)

The common choice for public APIs (Twilio, GitHub's REST v3 era, most SaaS). Keep both versions on **one service layer**: separate route trees and DTO mappers, shared domain logic.

```
routes/v1/tasks.ts  ─┐
                     ├─> TaskService (one set of business rules)
routes/v2/tasks.ts  ─┘
```

### Date-pinned versions (Stripe)

Each account is pinned to the API version it first integrated with. The code always produces the newest representation; a chain of small "version change" transformers converts responses back to older shapes. Breaking changes become cheap and frequent, at the price of maintaining that chain.

### Evolve without versions (GraphQL style)

Add new fields, mark old ones `@deprecated`, track field-level usage, remove when unused. It works well when you control all clients or have excellent usage telemetry.

## Deprecation playbook

1. **Decide and document** the replacement and a timeline. External APIs: 6–12+ months. Internal: weeks, with direct communication.
2. **Signal in-band** on every deprecated response:
   ```http
   Deprecation: @1767225600
   Sunset: Fri, 01 Jan 2027 00:00:00 GMT
   Link: <https://docs.wl.example/migrate-v2>; rel="deprecation"
   ```
   (`Deprecation` per RFC 9745, `Sunset` per RFC 8594.)
3. **Measure**: log deprecated-endpoint calls with the API key or client id. Dashboards show who's left.
4. **Reach out** to the remaining callers personally.
5. **Brownouts**: a few scheduled hours of 410/503 before the sunset flush out forgotten cron jobs.
6. **Remove**, and answer with `410 Gone` plus a problem `type` pointing at the migration guide for a while.

## Guarding compatibility in CI

- Keep `openapi.yaml` in the repo. It's code.
- Run a diff tool (oasdiff, openapi-diff) between `main` and the PR. Fail on breaking changes unless the PR also bumps the major version.
- Run conformance tests (like this module's) so the implementation can't drift away from the spec.
- Lint style with Spectral: naming, required `operationId`s, problem responses on every 4xx.

## Changes that aren't in the spec but still break clients

- Performance: an endpoint that went from 50 ms to 3 s breaks clients with timeouts.
- Rate limits lowered.
- Ordering of list results (if not documented, someone relied on it anyway).
- Eventual consistency introduced where reads used to be immediately consistent.

Treat these with the same care: announce them, measure, and roll them out gradually.
