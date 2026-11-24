# Challenge · Bookmarks API on bare `node:http`

**Type:** 🛠️ Build · **Est:** 3–4h · **Services:** none

## Scenario

> **#dev-tooling** · *Sam (senior engineer):* Our CLI needs a tiny bookmarks service, and I'd like you to build it **without a framework**: just `node:http`. Partly because it's a 200-line service, mostly because I want you to see what Express does for you before you start using it next week. The tests are the contract. They're picky about status codes and headers because our CLI and the corporate proxy are picky too. I've given you the types, the store and some response helpers; routing, body parsing, ETags and the handlers are yours.

## Your task

Implement the stubs in `challenge/src/`. Read the given files first: `types.ts`, `store.ts`, `httpError.ts`, `respond.ts`.

| TODO | File | What |
|---|---|---|
| 1 | `router.ts` | `Router.add` / `Router.match`: method + path matching with `:params`, HEAD → GET, 405 detection with the allowed methods |
| 2 | `etag.ts` | `computeEtag` (quoted hash) and `ifNoneMatchMatches` (lists, `*`, weak comparison) |
| 3 | `body.ts` + `app.ts` | `readJsonBody` (415/413/400, streaming byte count) and `createServer` wiring with one central error handler |
| 4 | `validation.ts` + `handlers.ts` | `parseBookmarkInput` and the five `/bookmarks` routes |
| 5 | `handlers.ts` | Conditional GET: `ETag`, `Cache-Control: no-cache`, `304 Not Modified` |

Suggested order: 1 → 2 (pure functions with unit tests), then 3 (the server comes alive, `/health` passes), then 4 and 5.

### API contract

| Request | Success | Errors |
|---|---|---|
| `GET /health` | `200 { status: "ok" }` | |
| `GET /bookmarks?tag=x` | `200 { data: Bookmark[] }` in creation order | |
| `POST /bookmarks` | `201 { data }` + `Location: /bookmarks/<id>` | 400, 413, 415 |
| `GET /bookmarks/:id` | `200 { data }` + `ETag` + `Cache-Control: no-cache`; `304` on matching `If-None-Match` | 404 |
| `HEAD` on any GET route | same status and headers as GET, no body | |
| `PUT /bookmarks/:id` | `200 { data }` (full replace) | 400, 404, 413, 415 |
| `DELETE /bookmarks/:id` | `204`, no body | 404 |
| unknown path | | `404 ROUTE_NOT_FOUND` |
| known path, wrong method | | `405 METHOD_NOT_ALLOWED` + `Allow` |
| anything unexpected | | `500 INTERNAL_ERROR`, generic message, logged |

Every error body is `{ "error": { "code": "...", "message": "..." } }` with `Content-Type: application/json`.

## Acceptance criteria

- [ ] The router matches method + path, captures and decodes params, answers HEAD with GET handlers, and reports allowed methods (`test/router.test.ts`).
- [ ] ETags are quoted, deterministic, change with content; `If-None-Match` handles lists, `*` and `W/` (`test/etag.test.ts`).
- [ ] `createServer()` returns an `http.Server` that tests start on port 0.
- [ ] POST/GET/PUT/DELETE behave as in the contract, including validation and tag normalization (`test/bookmarks.test.ts`).
- [ ] Conditional GET returns `304` with no body and the same `ETag`; changes produce a new `ETag`.
- [ ] HEAD returns the same headers as GET (including `Content-Length`) and no body.
- [ ] 404 vs 405 (with `Allow`) are distinguished; 415 for non-JSON bodies; 400 for malformed or empty JSON; 413 for bodies over `maxBodyBytes` (default 10 KiB), **including chunked bodies with no Content-Length** (`test/protocol.test.ts`).
- [ ] Unexpected errors produce a generic 500, are logged with `console.error`, never leak internals, and don't stop the server.
- [ ] `npm test` and `npm run typecheck` pass.

## Getting started

```bash
cd 03-http-fundamentals/challenge
make install
make test        # everything fails at first
npx vitest run test/router.test.ts   # work on one file at a time
make dev         # run it on :3000 and poke it with curl
```

Try it manually once TODO 3 is done:

```bash
curl -i localhost:3000/health
curl -i localhost:3000/bookmarks -H 'content-type: application/json' -d '{"url":"https://nodejs.org","tags":["node"]}'
curl -i localhost:3000/bookmarks/<id>
curl -i localhost:3000/bookmarks/<id> -H 'if-none-match: "<etag from above>"'
curl -I localhost:3000/bookmarks/<id>
curl -i -X PATCH localhost:3000/bookmarks
```

[docs/curl-cheatsheet.md](docs/curl-cheatsheet.md) has more, including how to send an oversized or chunked body.

## Rules

- Don't modify the tests or the given types in `types.ts`.
- **Only `node:` built-ins.** No Express, no router or body-parser packages.
- Handlers don't format error responses themselves: they `throw new HttpError(...)` and `app.ts` turns it into a response in one place.
- No `any`.

## Stretch goals

1. Add `PATCH /bookmarks/:id` (partial update). Is your implementation idempotent? Could it be?
2. Add `If-Match` support to `PUT`: respond `412 Precondition Failed` when the client's ETag is stale (preview of [module 23](../23-api-design/README.md)).
3. Respond to `OPTIONS` on any known path with `204` and an `Allow` header.
4. Add an access log: one line per request with method, path, status and duration, using `res.on("finish")`.
5. Make `GET /bookmarks` support `?limit=` with validation, and an ETag for the list.

## Done?

1. `npm test` is green and `npm run typecheck` is clean.
2. Commit on your branch `module/03-http-fundamentals`, push and open a PR. CI runs this module's tests. Ask Claude to review the PR if you want feedback.
3. From the repo root: `npm run progress -- 03` to tick it off on the roadmap.
4. Answer the questions in [INTERVIEW.md](INTERVIEW.md).
5. Add an entry to [LOG.md](../LOG.md).
6. Compare with the reference solution: `git diff main origin/solutions -- 03-http-fundamentals/` (and read `SOLUTION.md` on that branch).

Stuck? → [HINTS.md](HINTS.md)
