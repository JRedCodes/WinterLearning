# Challenge · Notes API

**Type:** 🧩 Scaffold · **Est:** 3–4h · **Services:** none

## Scenario

> **#backend** · *Priya (tech lead):* We're spinning up a small notes service for the internal tools team. I stubbed the project: `app.ts` is wired, the store works, and the tests describe the contract we agreed with the frontend. Can you fill in the TODOs? The frontend team relies on the error shape being identical everywhere, so please route **all** errors through the error handler. Also, ops is sick of 500s that are really just bad JSON from clients. 🙏

## Your task

Work through the numbered `TODO(n)` comments in `challenge/src/`:

| TODO | File | What |
|---|---|---|
| 1 | `middleware/requestId.ts` | Request id middleware (reuse a valid incoming `X-Request-Id`, else generate one) |
| 2 | `routes/notes.ts` | `GET /notes` with `?q=` search and validated `?limit=` |
| 3 | `routes/notes.ts` | `GET /notes/:id` |
| 4 | `routes/notes.ts` | `POST`, `PATCH`, `DELETE` with validation |
| 5 | `middleware/notFound.ts` | JSON 404 for unknown routes |
| 6 | `middleware/errorHandler.ts` | Central error handler: `HttpError`, bad JSON, unexpected errors |

The full API contract is in the TODO comments and in `test/`. Use the helpers in `src/lib/httpError.ts`.

## Acceptance criteria

- [ ] Every response has an `X-Request-Id` header. A valid incoming one is reused.
- [ ] `GET /notes` returns `{ data: Note[] }` in creation order, filtered by `q` (title or body, case-insensitive), limited by `limit` (1–100, default 20).
- [ ] `GET /notes/:id` returns the note or 404 `NOT_FOUND`.
- [ ] `POST /notes` validates input, returns 201 + `Location` header.
- [ ] `PATCH /notes/:id` updates only the provided fields and rejects empty patches.
- [ ] `DELETE /notes/:id` returns 204 with an empty body.
- [ ] Unknown routes return JSON 404 `ROUTE_NOT_FOUND`.
- [ ] Malformed JSON returns 400 `INVALID_JSON`.
- [ ] Unexpected errors return 500 `INTERNAL_ERROR` with a generic message, and are logged.
- [ ] Every error body has the shape `{ error: { code, message, requestId } }`.
- [ ] `npm test` and `npm run typecheck` pass.

## Getting started

```bash
cd 05-express-basics/challenge
make install
make test        # watch them fail, then make them pass one TODO at a time
make dev         # optional: run it and poke it with curl
```

Try it manually:

```bash
curl -i localhost:3000/notes -H 'content-type: application/json' -d '{"title":"hello"}'
curl -i localhost:3000/notes?q=hel
curl -i localhost:3000/nope
curl -i localhost:3000/notes -H 'content-type: application/json' -d '{"title":'
```

Use `npm run test:watch` while you work. It reruns on save.

## Rules

- Don't modify the tests.
- No extra dependencies (no validation library yet; that's module 07).
- Route handlers must not build error responses themselves. They `throw` an `HttpError` and the error handler formats it.

## Stretch goals

1. Add an access-log middleware that prints one JSON line per request: method, path, status, duration, requestId.
2. Support `?sort=createdAt|-createdAt`.
3. Add `ETag` support to `GET /notes/:id` and return `304 Not Modified` when `If-None-Match` matches.
4. Write one extra test of your own for a case the suite doesn't cover.

## Done?

1. `npm test` is green and `npm run typecheck` is clean.
2. Commit on your branch `module/05-express-basics`, push and open a PR. CI runs this module's tests. Ask Claude to review the PR if you want feedback.
3. From the repo root: `npm run progress -- 05` to tick it off on the roadmap.
4. Answer the questions in [INTERVIEW.md](INTERVIEW.md).
5. Add an entry to [LOG.md](../LOG.md).
6. Compare with the reference solution: `git diff main origin/solutions -- 05-express-basics/` (and read `SOLUTION.md` on that branch).

Stuck? → [HINTS.md](HINTS.md)
