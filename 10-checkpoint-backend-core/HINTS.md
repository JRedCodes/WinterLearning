# Hints · Checkpoint: Backend Core

This is a checkpoint, so hints are deliberately higher-level. Open one at a time.

## Where do I even start?

<details><summary>Hint 1</summary>

Get one test green end to end before building everything. `GET /health` plus request ids is a good first target: it forces you to create `createApp`, the middleware chain and the error handler.
</details>

<details><summary>Hint 2</summary>

Build in this order: config → app skeleton (requestId, json, health, notFound, errorHandler) → domain types and errors → repository interfaces + in-memory classes → habits (service, controller, routes) → check-ins → stats. Reread section 5 of the lesson.
</details>

<details><summary>Hint 3</summary>

The structure from module 06 and the [project structure cheat sheet](docs/project-structure-cheatsheet.md) has skeletons for each layer. `createApp` creates the repositories (in-memory by default), the services (passing in repositories and the clock) and the routers (passing in services).
</details>

## Authentication and request ids

<details><summary>Hint 1</summary>

Both are middleware. One runs for every request; the other only for `/habits`.
</details>

<details><summary>Hint 2</summary>

Put `authenticate()` as the first `router.use(...)` of the `/habits` router, store the user id on `res.locals.userId`, and give `res.locals` a type with declaration merging (`declare global { namespace Express { interface Locals { ... } } }`). Throwing an `HttpError(401, ...)` in middleware reaches the error handler like any other error.
</details>

## Validation details

<details><summary>Hint 1</summary>

zod's error has an `issues` array; each issue has a `path` (an array) and a `message`.
</details>

<details><summary>Hint 2</summary>

Write one `parse(schema, input)` helper that throws `HttpError(400, "VALIDATION_ERROR", ..., details)` with `details = issues.map(i => ({ path: i.path.join("."), message: i.message }))`. Use it for bodies, params (`:date`) and query strings. For "at least one field" and "from ≤ to", use `.refine(...)` on the object schema (give the range refinement a `path`).
</details>

## Uniqueness and ownership

<details><summary>Hint 1</summary>

Both are business rules, so they belong in the service, not in the controller or the repository.
</details>

<details><summary>Hint 2</summary>

Have one service method like `get(userId, habitId)` that throws `HABIT_NOT_FOUND` when the habit is missing **or** belongs to someone else, and reuse it in every operation (including check-ins and stats). For names, compare `name.trim().toLowerCase()`; when renaming, skip the check if the normalized name didn't change.
</details>

## Dates

<details><summary>Hint 1</summary>

Keep dates as `YYYY-MM-DD` strings. They compare and sort correctly as strings.
</details>

<details><summary>Hint 2</summary>

Today: `clock.now().toISOString().slice(0, 10)`. Validation: regex, then build `new Date(Date.UTC(y, m - 1, d))` and check that year, month and day come back unchanged. Adding days: `Date.parse(date + "T00:00:00Z") + n * 86_400_000`, then `toISOString().slice(0, 10)`. Only ever use `getUTC*` methods. More in [docs/dates-and-time.md](docs/dates-and-time.md).
</details>

## Streaks

<details><summary>Hint 1</summary>

Make it a pure function: `(dates, today) => stats`. Then you can test it without HTTP.
</details>

<details><summary>Hint 2</summary>

Put the dates in a `Set`. Current streak: start at today if it's in the set, else yesterday; step back one day at a time while the set has the date. Longest: sort, walk once, extend the run when a date is exactly one day after the previous, reset to 1 otherwise. 30-day window: `d >= addDays(today, -29) && d <= today`.
</details>

## The 500 test

<details><summary>Hint 1</summary>

The test passes a clock whose `now()` throws. If creating a habit reads the clock (for `createdAt`), that error travels to your error handler as an unexpected error.
</details>

<details><summary>Hint 2</summary>

In the error handler, start from a safe default (500, `INTERNAL_ERROR`, "Something went wrong"), override it only for `DomainError`, `HttpError` and JSON parse errors, and `console.error` everything else with the request id.
</details>

## Architecture test failures

<details><summary>Hint</summary>

Read the test file: each rule prints the offending files. Common causes: a service importing a type from `express`, a service importing something from `controllers/`, a `process.env` in `server.ts` (pass values through `loadConfig` instead), or a repository class that doesn't say `implements HabitRepository`.
</details>
