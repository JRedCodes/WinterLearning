# Challenge · kv-lite

**Type:** 🛠️ Build (no scaffold) · **Est:** 4–5h · **Services:** none

## Scenario

> **#infra** · *Dana (infra lead):* Our integration test rigs need a tiny shared key-value store: feature flags, short-lived tokens, test fixtures. Redis is overkill for a rig that runs on a laptop, and we want zero dependencies. Spec below; the acceptance tests are in `test/`. One constraint from me: **I'll review the structure, not just the tests.** I want to be able to find the TTL logic, the file handling and the HTTP code without reading all of it. Write a short design note in your PR description explaining the layout and the durability guarantee.

## What you're given

- `package.json`, `tsconfig.json`, `vitest.config.ts`, `Makefile`
- `src/index.ts`: the **public contract** (types + a stub `createKvServer`). Keep the exports and their shapes; implement the rest wherever you like.
- `src/server.ts`: an entry point for `make dev` that calls your code.
- `test/`: the acceptance tests. They import only from `src/index.ts`.

Everything else is yours to design. The lesson ([README.md](README.md)) and [docs/project-structure.md](docs/project-structure.md) discuss good shapes.

## Spec

### HTTP API

| Request | Success | Errors |
|---|---|---|
| `PUT /kv/:key[?ttl=seconds]` (body = value) | `201` if the key was new (or expired), `200` if it replaced a live key. Body: `{ "key": "...", "expiresAt": "<ISO>" \| null }` | `400 INVALID_KEY`, `400 INVALID_TTL`, `413 VALUE_TOO_LARGE` |
| `GET /kv/:key` | `200`, body = the exact stored value, `Content-Type` = the one sent on PUT (default `application/octet-stream`), `X-Expires-At: <ISO>` header if it has a TTL | `404 KEY_NOT_FOUND` |
| `DELETE /kv/:key` | `204`, empty body | `404 KEY_NOT_FOUND` |
| `GET /stats` | `200 { keys, hits, misses, sets, deletes, expired, flushes }` | |
| other paths | | `404 ROUTE_NOT_FOUND` |
| wrong method | | `405 METHOD_NOT_ALLOWED` + `Allow` header |

- **Keys**: 1–200 characters from `A-Z a-z 0-9 . _ : -` after URL-decoding. Anything else (including malformed percent-encoding) → 400 `INVALID_KEY`. A path with extra segments (`/kv/a/b`) → 404.
- **Values**: UTF-8 text, any content type, empty allowed, at most `maxValueBytes` (default 1 MiB).
- **TTL**: an integer number of seconds, 1 to 31,536,000 (one year). Store the **absolute** expiry time. A PUT without `ttl` makes the key permanent (removing any previous TTL). A rejected PUT stores nothing.
- **Errors** are JSON: `{ "error": { "code": "...", "message": "..." } }`. Unexpected errors → 500 `INTERNAL_ERROR` with a generic message.

### Expiry

- **Lazy**: an expired key behaves exactly like a missing one, immediately: GET → 404 (a miss), DELETE → 404, PUT → 201, not counted in `keys`, not written to the snapshot.
- **Active**: every `sweepIntervalMs` (default 1000), remove all expired keys from memory.
- `expired` in `/stats` counts every key removed because of its TTL, whichever way it was removed.
- All time comes from the injected `clock` (default `Date.now`).

### Persistence

- On start: load `dataFile` if it exists. **Missing** → start empty. **Corrupt or invalid** → `createKvServer` rejects (don't touch the file). Skip entries that expired while the server was down.
- After changes: flush the full snapshot **debounced** (`flushDebounceMs` after the last change, default 100). `flushes` in `/stats` counts completed writes.
- **Atomic writes**: write a temp file in the same directory, then `rename` it over `dataFile`. Never leave temp files behind. Create the parent directory if needed.
- Writes never overlap, and a change that arrives during a write is not lost.
- The file format is yours (include a version field, you'll thank yourself later).

### Lifecycle

- `createKvServer(options)` loads the snapshot and returns a `KvServer` without listening.
- `listen(port?, host?)` resolves with the actual port (`0` = random).
- `close()`: stop the sweeper, stop accepting connections and close idle ones, wait for the server to close, **flush pending changes immediately**, resolve. Calling it twice is safe.

## Acceptance criteria

- [ ] CRUD, content types, 201 vs 200, key validation, 413, 404/405, JSON errors (`test/kv.test.ts`)
- [ ] `/stats` counters are exact (`test/kv.test.ts`)
- [ ] TTL: absolute expiry, `X-Expires-At`, lazy expiry at the exact millisecond, TTL reset/removal, ttl validation (`test/ttl.test.ts`)
- [ ] The sweeper removes expired keys nobody reads (`test/ttl.test.ts`)
- [ ] Data survives restarts; `close()` flushes despite a long debounce; bursts are coalesced into 1–2 writes; files are valid JSON with no temp files left; expired keys aren't resurrected; corrupt files refuse to load; `close()` is idempotent and stops the server (`test/persistence.test.ts`)
- [ ] `npm test` and `npm run typecheck` pass
- [ ] Your structure separates core logic, persistence and HTTP (reviewed, not tested)

## Getting started

```bash
cd 04-checkpoint-foundations/challenge
make install
make test        # all red except one
make dev         # run kv-lite on :3000 with data in ./data/kv.json
```

```bash
curl -i -X PUT localhost:3000/kv/greeting -H 'content-type: text/plain' -d 'hello'
curl -i -X PUT 'localhost:3000/kv/token?ttl=30' -d 'abc123'
curl -i localhost:3000/kv/token
curl -s localhost:3000/stats | jq
# Ctrl-C, start again: your keys are still there
```

Suggested path: sketch the components on paper first (15 minutes well spent). Then build the core store with the clock, then HTTP on top, then persistence, then the lifecycle. Run one test file at a time: `npx vitest run test/kv.test.ts`.

## Rules

- Don't modify the tests or the exported types in `src/index.ts`.
- Only `node:` built-ins. No Express, no database, no `write-file-atomic`.
- No `any`. Parse the snapshot file as `unknown` and validate it.
- `process.env` is only read in `src/server.ts`.

## Stretch goals

1. **Max wait**: guarantee a flush at least every N ms even if changes never pause (a pure trailing debounce can be starved).
2. **Real durability**: `fsync` the temp file and the directory. Measure how much slower 1,000 PUTs get with a tiny debounce.
3. **Append-only log**: instead of rewriting the snapshot, append one line per change and compact on startup. Compare startup time and write cost.
4. **Sampled sweeping**: like Redis, check 20 random keys with TTLs per cycle and repeat if more than 25% were expired. Why does this matter at a million keys?
5. Add `GET /kv?prefix=user:` to list keys, with a limit.
6. Write unit tests for your store and flusher directly (no HTTP), using `vi.useFakeTimers()` for the debouncer.

## Done?

1. `npm test` is green and `npm run typecheck` is clean.
2. Commit on your branch `module/04-checkpoint-foundations`, push and open a PR **with a design note** (layout + durability guarantee in a few sentences). CI runs this module's tests. Ask Claude to review the PR, structure included.
3. From the repo root: `npm run progress -- 04` to tick it off on the roadmap.
4. Answer the questions in [INTERVIEW.md](INTERVIEW.md).
5. Add an entry to [LOG.md](../LOG.md): what was hardest about designing without a scaffold?
6. Compare with the reference solution: `git diff main origin/solutions -- 04-checkpoint-foundations/` (and read `SOLUTION.md` on that branch).

Stuck? → [HINTS.md](HINTS.md)
