# Refactoring a god file safely

You'll inherit a file like the challenge's `app.ts` at every job. The urge is to delete it and rewrite it cleanly over a weekend. Don't. Rewrites lose the edge cases nobody wrote down. The professional move is a series of **small, behavior-preserving steps**, each verified by tests.

## Step 0: pin down current behavior

Before you change a line, get **characterization tests**: tests that describe what the code *does* today (not what it should do). In the challenge that's `test/http.test.ts`, which is already green. In real life you often write these first, through the outermost interface (HTTP), because that's the only seam the code has.

Rule for the whole refactor: **the characterization tests stay green after every step.** If one goes red, undo the last step instead of "fixing" the test.

> Fixing bugs is a separate activity. When you find one (you will: the challenge has two), note it, finish the structural step you're on, then fix the bug in its own step, ideally with a failing unit test first. Mixing "move code" and "change behavior" in one step is how refactors break production.

## Step 1: extract pure functions (domain)

Find logic that only computes: seat counting, "does it fit", "has it started", email normalization, promotion selection. Pull each one into a pure function in `domain/` and call it from the old handlers. Duplicated loops collapse into one function.

This step is low-risk and high-value. It also often *reveals* bugs: when two copies of "the same" logic disagree (`<` vs `<=`), you have to decide which one is right.

## Step 2: introduce seams for hidden dependencies

- `Date.now()` / `new Date()` → a `Clock`
- `randomUUID()` → an `IdGenerator`
- `process.env.X` → a value from `config.ts`
- module-level `Map`s → a repository object

At first, create these at the top of `createApp()` and use them in the handlers. Behavior stays the same, but the dependencies are now objects you could replace.

## Step 3: define repository interfaces, move storage behind them

Write the interface from what the handlers *actually need* (`findById`, `listByEvent`, `insert`, `update`). Implement it with the existing Maps. Change handlers to go through it. Convert to `async` now; Express 5 handles async handlers for you.

Watch for **in-place mutation**: the god file does `rsvp.status = "cancelled"` on an object stored in the Map and never "saves". Behind a repository you must call `update()`. If your in-memory repository clones (as it should), forgetting this shows up immediately.

## Step 4: extract services, one use case at a time

Take one endpoint, say `POST /events/:id/rsvps`. Move everything that isn't HTTP into `RsvpService.create(eventId, input)`. Replace each `sendError(res, 409, …)` with `throw new SomeDomainError()`. The handler shrinks to parse → call → respond. Run the tests. Commit. Next endpoint.

Add an error handler that maps domain errors to statuses **before** you convert the first endpoint, so thrown errors have somewhere to go.

## Step 5: split the HTTP layer

Once handlers are thin, move them into `controllers/` (factories that receive services) and `routes/` (the path table). `app.ts` becomes ~25 lines of `app.use(...)`.

## Step 6: build the composition root

Move all `new …` calls out of `createApp()` into `createContainer()`. `createApp(deps)` now only receives services. `server.ts` loads config, builds the container, listens.

## Step 7: lock it in

Add or enable architecture tests (or a lint rule) so the structure can't quietly erode.

## Commit rhythm

Aim for a commit per step, or even per endpoint in step 4. Small commits make review possible ("move only, no behavior change" is easy to approve), and if something breaks, `git bisect` points straight at the culprit. In a team you'd ship these as several small PRs over a few days, not one 2,000-line PR.

## The strangler fig pattern (at system scale)

The same idea applies to whole systems: route traffic for one feature at a time from the legacy app to the new one, until the old one handles nothing and can be deleted. Martin Fowler named it after a vine that slowly replaces its host tree. Module 30 revisits it in system design.
