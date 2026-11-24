# Challenge · Tasks frontend

**Type:** 🛠️ Build · **Est:** 4–5h · **Services:** none (the API is faked in tests)

## Scenario

> **#tasks-squad** · *Aisha (product engineer):* The tasks API from module 23 is live in staging and the web app needs a frontend for it. I've set up Vite, the zod contract, the `ErrorBoundary`, the config loader and a presentational `TaskItem`. The rest is yours: the API client, the data hooks and the two main components. Support's top complaints about the old app were "I clicked Add twice and got two tasks", "my change silently overwrote my teammate's", and "the list goes blank when the network blips". The tests encode all three. Please also keep HTTP out of the components; the last app had `fetch` in 30 places. 🙏

## Your task

Implement the numbered `TODO(n)` stubs in `challenge/src/`. Each one has a detailed contract in its comment.

| TODO | File | What |
|---|---|---|
| 1 | `api/client.ts` | Typed `fetch` wrapper: URL + query building, JSON bodies, response validation, error mapping to `ApiError` |
| 2 | `api/tasks.ts` | `list` / `create` / `update` endpoints with cursor, `Idempotency-Key` and `If-Match` |
| 3 | `hooks/useTasks.ts` | `useInfiniteQuery` with cursor pagination and a flattened `select` |
| 4 | `hooks/useCreateTask.ts` | Optimistic create: cancel, snapshot, insert, rollback, invalidate |
| 5 | `hooks/useUpdateTask.ts` | Update from the response with `setQueryData`; refetch on 412 conflict |
| 6 | `components/TaskList.tsx` | Loading / error + Retry / empty / list / Load more / update errors |
| 7 | `components/NewTaskForm.tsx` | Form validated with the shared `NewTaskSchema`; server field errors; pending state |

Provided and working: `schemas/task.ts` (the contract), `api/errors.ts` (`ApiError`), `api/TasksApiContext.tsx` (DI), `lib/config.ts`, `lib/queryClient.ts`, `lib/optimistic.ts`, `hooks/queryKeys.ts`, `components/TaskItem.tsx`, `components/ErrorBoundary.tsx`, `App.tsx`, `main.tsx`.

Suggested order: 1 → 2 (run `npx vitest run test/client.test.ts test/tasksApi.test.ts` until green) → 3 → 6 → 5 → 7 → 4.

### The API contract (module 23)

| Call | Request | Success |
|---|---|---|
| List | `GET /v1/projects/:projectId/tasks?limit=&cursor=&status=` | `200 { data: Task[], page: { limit, nextCursor } }`, newest first |
| Create | `POST /v1/projects/:projectId/tasks` + `Idempotency-Key: <uuid>`, body `{ title, priority, dueDate }` | `201 Task` |
| Update | `PATCH /v1/tasks/:taskId` + `If-Match: "<version>"`, body = changed fields | `200 Task` (version + 1) |
| Errors | | `application/problem+json`: `{ type, title, status, detail, errors?: [{ pointer, detail }] }`. 412 = stale `If-Match` |

## Acceptance criteria

- [ ] **Client** (`test/client.test.ts`): builds URLs with query params (skipping null/undefined); JSON body + `Content-Type` only when there's a body; `Accept` and custom headers; passes `signal`; validates responses with the schema; 204 → `undefined`; maps problem+json to `ApiError(http)` with `detail`/`title` message and `fieldErrors` from pointers; non-JSON errors get a generic message; network failures → `ApiError(network)`; schema mismatch / non-JSON 2xx → `ApiError(invalid_response)`; `AbortError` passes through untouched.
- [ ] **Tasks API** (`test/tasksApi.test.ts`): cursor pagination; status filter; `Idempotency-Key` on create; `If-Match: "<version>"` on update; 412 surfaces as `isConflict`.
- [ ] **List** (`test/TaskList.test.tsx`): loading state; empty state; API error message with a working Retry; network error message; Load more with cursors until the last page; Load more disabled ("Loading more…") while loading; a failed Load more keeps loaded tasks.
- [ ] **Update** (`test/TaskList.test.tsx`): status change sends `If-Match`, updates the UI from the PATCH response **without refetching the list**, and the next update uses the new version; a 412 shows the conflict message and refetches; other errors show "Could not update task: …".
- [ ] **Form** (`test/NewTaskForm.test.tsx`): labelled fields with defaults; client validation with the shared schema (no request sent, `aria-invalid`, described by the message); errors clear on edit; sends trimmed input, `dueDate: null` when empty, a UUID `Idempotency-Key` that differs per submission; resets after success.
- [ ] **Optimistic create** (`test/NewTaskForm.test.tsx`): the task appears at the top with "Saving…" before the server answers, button shows "Adding…" and is disabled; afterwards it appears exactly once and the list was refetched; on failure the task is rolled back, an alert shows the server's message, and the input keeps the text; server field errors appear under the field.
- [ ] `npm test` and `npm run typecheck` pass.

## Getting started

```bash
cd R2-react-data/challenge
make install
make test        # all red; start with the client tests
npm run test:watch
```

The tests use a fake API (`test/helpers/fakeApi.ts`) installed with `vi.stubGlobal("fetch", ...)`. Read it: it's a compact executable spec of the contract. To run the app against a real backend, see [docs/env-and-cors.md](docs/env-and-cors.md) (`make dev` → http://localhost:5173).

## Rules

- Don't modify the tests or the test helpers.
- No extra dependencies.
- Components never call `fetch` or build URLs. Only `api/client.ts` touches `fetch`/`Response`; only `api/tasks.ts` knows endpoint paths.
- Hooks get the API from `useTasksApi()`, not by importing a singleton.
- No copying query data into `useState`. The query cache is the source of truth for server data.
- Cache updates are immutable.

## Stretch goals

1. **Status filter**: add a filter select (All / To do / In progress / Done) that passes `status` to the API. Remember what this means for the query key.
2. **Optimistic status change** for `useUpdateTask`, with rollback, and decide how it interacts with 412 conflicts.
3. **Prefetch** the next page when the user hovers "Load more" (`queryClient.prefetchInfiniteQuery` or `fetchNextPage` on hover).
4. **Automatic retry for create**: set `retry: 2` on the create mutation and write a test proving the same `Idempotency-Key` is reused across retries and only one task is created.
5. **Wire up CORS** in your module 23 API (see the docs) and run this frontend against it.
6. Add `@tanstack/react-query-devtools` in development and watch the cache while you click around.

## Done?

1. `npm test` is green and `npm run typecheck` is clean.
2. Commit on your branch `module/R2-react-data`, push and open a PR. CI runs this module's tests.
3. From the repo root: `npm run progress -- R2` to tick it off on the roadmap.
4. Answer the questions in [INTERVIEW.md](INTERVIEW.md).
5. Add an entry to [LOG.md](../LOG.md).
6. Compare with the reference solution: `git diff main origin/solutions -- R2-react-data/` (and read `SOLUTION.md` on that branch).

Stuck? → [HINTS.md](HINTS.md)
