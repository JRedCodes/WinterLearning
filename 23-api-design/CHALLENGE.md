# Challenge · Tasks & Projects API, spec-first

**Type:** 🛠️ Build (spec-first) · **Est:** 4–5h · **Services:** none (in-memory repositories)

## Scenario

> **#api-guild** · *Jonas (product):* Mobile and two partners want to integrate with tasks & projects next quarter. Requirements are below.
>
> *Leila (tech lead):* We're doing this **spec-first**. Write `openapi.yaml` before you touch the task code; mobile will generate their client from it. The projects endpoints are already built and half-documented, so use them as a style reference. The test suite validates every response against *your* spec, so if the spec and the code disagree, you'll know. And please write down the versioning rules this time. Last year a "harmless" field rename broke the Android app for two weeks.

### Product requirements

1. A **project** has a name (1–100 chars) and an optional description (≤ 1000). Projects can be created, read and listed. *(Built.)*
2. A **task** belongs to one project. It has a title (1–200 chars), a status (`todo`, `in_progress`, `done`; default `todo`), a priority (`low`, `medium`, `high`; default `medium`) and an optional due date (calendar date or `null`).
3. Tasks are created and listed **under their project**, but each task has its own URL for reading, editing and deleting: `/v1/tasks/{taskId}`.
4. Task lists must support **filtering by status**, sorting by creation time in either direction (`sort=createdAt` | `sort=-createdAt`), and **stable cursor pagination** (`limit` 1–100, default 20; `page.nextCursor`). The mobile app does infinite scroll on lists that change while you scroll.
5. Mobile retries requests on flaky networks. **Creating a task must be safe to retry** with an `Idempotency-Key` header.
6. Two people editing the same task must not silently overwrite each other: tasks carry an **ETag**, edits **require `If-Match`**, edits use **JSON Merge Patch**, and `GET` supports `If-None-Match` → 304.
7. **Every error** is an RFC 9457 problem (`application/problem+json`) with a stable `type` URI.

## Your task

| TODO | File | What |
|---|---|---|
| 1 | `openapi.yaml` | Complete the OpenAPI 3.1 contract (task operations, schemas, `Problem`, headers, error responses) |
| 2 | `src/middleware/problemDetails.ts` | RFC 9457 error handler + 404 for unknown routes |
| 3 | `src/lib/cursor.ts` | Opaque cursor encode/decode with strict validation |
| 4a | `src/services/taskService.ts` | `list`: keyset pagination with filter + sort (mirror `ProjectService.list`) |
| 4b | `src/services/taskService.ts` | `update`: optimistic concurrency (412 on version mismatch, compare-and-set) |
| 5a | `src/lib/etag.ts` | `etagFor`, `parseIfMatch` (strong), `ifNoneMatchHits` (weak) |
| 5b | `src/controllers/taskController.ts` | `list`, `get` (ETag/304), `update` (428/412/200 + new ETag) |
| 6 | `src/middleware/idempotency.ts` | `Idempotency-Key`: replay, 422 on reuse, 409 in flight, don't store 5xx |
| 7 | `DECISIONS.md` | Versioning & evolution ADR: options, decision, breaking-change rules, deprecation |

Do TODO 1 first, for real: write the whole contract, then implement against it. The detailed rules for each TODO are in the comments in each file. The exact `operationId`s, statuses and schema names the tests expect are listed at the top of `test/openapi.test.ts`.

## Acceptance criteria

**Spec** (`openapi.test.ts`)
- [ ] OpenAPI 3.1 document; every `$ref` resolves; unique `operationId` + `summary` per operation; path parameters declared.
- [ ] Operations `listProjects`, `createProject`, `getProject`, `listProjectTasks`, `createTask`, `getTask`, `updateTask`, `deleteTask` with all their documented statuses (incl. 304, 409, 412, 422, 428).
- [ ] Every 4xx/5xx response uses `application/problem+json` with `$ref: "#/components/schemas/Problem"`.
- [ ] `Location` on 201s; `ETag` on task 200/201s; optional `Idempotency-Key` on `createTask`; required `If-Match` on `updateTask`; `limit` (max 100) and `cursor` on lists, plus `status` and `sort` on tasks.
- [ ] Schemas `Project`, `NewProject`, `ProjectList`, `Task`, `NewTask`, `TaskPatch`, `TaskList`, `PageInfo`, `Problem` with the required fields, enums, nullability and `additionalProperties: false` the tests describe.

**Conformance**: every response in the HTTP tests must have a documented status and media type and must validate against your schema.
- [ ] Problem details for domain errors, validation (with `errors[{pointer, detail}]`), malformed JSON, unknown routes, and 500s without leaks. (`errors.test.ts`)
- [ ] Cursors are opaque base64url and reject garbage with a 400 on `/cursor`. (`cursor.test.ts`, `projects.test.ts`)
- [ ] Task CRUD, status filter, both sort orders, pagination walks without duplicates or gaps, cursor/sort mismatch → 400. (`tasks.test.ts`)
- [ ] ETag `"<version>"`; `If-None-Match` → 304; `If-Match` missing → 428, stale or weak → 412, current or `*` → 200 with a new ETag; merge-patch semantics. (`concurrency.test.ts`)
- [ ] Idempotent create: replay with `Idempotent-Replayed: true`, 422 on body mismatch, 409 when in flight, scoped per endpoint, 4xx stored, 5xx not stored, invalid keys → 400. (`idempotency.test.ts`)

**Decision record** (`decisions.test.ts`)
- [ ] `DECISIONS.md` has all four sections filled in (≥ 30 words each) and covers versioning, breaking changes and deprecation.

- [ ] `npm test` and `npm run typecheck` pass.

## Getting started

```bash
cd 23-api-design/challenge
make install
make test         # lots of red
make lint-spec    # only the spec structure tests, while you write openapi.yaml
make dev          # optional: run it on :3000
```

Paste `openapi.yaml` into https://editor.swagger.io to see it rendered while you write it.

```bash
P=$(curl -s localhost:3000/v1/projects -H 'content-type: application/json' -d '{"name":"Launch"}' | jq -r .id)
curl -i -X POST localhost:3000/v1/projects/$P/tasks -H 'content-type: application/json' \
     -H 'Idempotency-Key: 3f8a2c1e-demo' -d '{"title":"Write spec"}'     # run it twice
curl -i "localhost:3000/v1/projects/$P/tasks?limit=1"
```

## Rules

- Don't modify the tests.
- No new runtime dependencies. (`ajv`, `ajv-formats` and `yaml` are dev dependencies used by the tests.)
- Keep the layering: HTTP concerns (headers, status codes) in controllers and middleware; rules (versions, cursors, policies) in services and lib; no Express in services.
- The spec is the contract: if a test says a response doesn't conform, decide deliberately whether the spec or the code is wrong.

## Stretch goals

1. **`?fields=`** partial responses on `GET /v1/tasks/{id}`, documented in the spec.
2. **`Deprecation` / `Sunset` headers**: add a deprecated `GET /v1/projects/{id}/task-count` endpoint that sends them, and mark it `deprecated: true` in the spec.
3. **Sign cursors** with an HMAC so tampered cursors are rejected without validating each field.
4. **Bind cursors to filters**: a cursor from `status=done` must be rejected when used without that filter.
5. **Webhook design**: add a `webhooks:` section (OpenAPI 3.1 supports it) describing a signed `task.completed` event.
6. **Lint the spec** with Spectral (`npx @stoplight/spectral-cli lint openapi.yaml`) and fix the warnings.

## Done?

1. `npm test` is green and `npm run typecheck` is clean.
2. Commit on your branch `module/23-api-design`, push and open a PR. CI runs this module's tests. Ask Claude to review the PR (and the spec!) if you want feedback.
3. From the repo root: `npm run progress -- 23` to tick it off on the roadmap.
4. Answer the questions in [INTERVIEW.md](INTERVIEW.md).
5. Add an entry to [LOG.md](../LOG.md).
6. Compare with the reference solution: `git diff main origin/solutions -- 23-api-design/` (and read `SOLUTION.md` on that branch).

Stuck? → [HINTS.md](HINTS.md)
