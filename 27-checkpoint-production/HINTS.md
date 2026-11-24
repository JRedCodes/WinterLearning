# Hints · Checkpoint: Production Readiness

Open one hint at a time. Give each a real try before opening the next. For the overall order of work, see [docs/hardening-walkthrough.md](docs/hardening-walkthrough.md).

## Errors, request ids, headers

<details><summary>Hint 1</summary>

You built all of this before: module 05 (request id, error handler, 404) and module 25 (helmet). The new part is mapping more error types and including `requestId` in every body.
</details>

<details><summary>Hint 2</summary>

Body-parser errors have a `type`: `"entity.parse.failed"` (400) and `"entity.too.large"` (413). Order: `requestId` → logging/metrics → `helmet()` → `express.json({ limit: "100kb" })` → routes → notFound → errorHandler.
</details>

<details><summary>Hint 3</summary>

Give `HttpError` an optional `headers` field so a 429 can carry `Retry-After` through the error handler: `if (err.headers) res.set(err.headers)`.
</details>

## Logs and metrics

<details><summary>Hint 1</summary>

One middleware can do both: record the start time, and on `res.once("finish")` log one line and update the metrics.
</details>

<details><summary>Hint 2</summary>

`logger.child({ requestId })` returns a logger that adds the id to every line, so store it on `res.locals.log` and use it in the error handler too. For metrics, create `new Registry()` inside `createApp` and pass `registers: [registry]` to each `Counter`/`Histogram`.
</details>

<details><summary>Hint 3</summary>

The route label is `req.route?.path` (undefined → `"unmatched"`). Register routes with full paths (`router.get("/notes/:id", …)`) so the path is the whole template. For redaction, pino takes `redact: { paths: ["password", "*.password", "req.headers.cookie", …], censor: "[REDACTED]" }`, but the real fix is not logging bodies and headers in the first place.
</details>

## Users, passwords, sessions

<details><summary>Hint 1</summary>

You need a migration that adds `users` and a `notes.owner_id`. Store the email lower-cased with a unique index.
</details>

<details><summary>Hint 2</summary>

`crypto.scrypt(password, salt, 64, cb)` with a random 16-byte salt. Store `scrypt$<salt b64>$<hash b64>` (adding parameters is even better) and compare with `crypto.timingSafeEqual`. Session id: `randomBytes(32).toString("base64url")`, `redis.set(key, json, "EX", ttl)`.
</details>

<details><summary>Hint 3</summary>

Express has `res.cookie(name, value, { httpOnly: true, sameSite: "lax", secure, path: "/", maxAge })` and `res.clearCookie`. Reading cookies needs a tiny parser for `req.headers.cookie` (split on `;`, then on the first `=`). For "unknown email", still run `verifyPassword` against a precomputed dummy hash so both failures take the same time.
</details>

## Ownership and validation

<details><summary>Hint 1</summary>

Where is the one place every note query passes through? Make it impossible to call without an owner.
</details>

<details><summary>Hint 2</summary>

Change the repository signatures to `findForOwner(ownerId, id)` and friends, with `WHERE id = $1 AND owner_id = $2`. "Not found" and "not yours" become the same `NoteNotFoundError`.
</details>

<details><summary>Hint 3</summary>

zod: `z.object({ title: z.string().trim().min(1).max(200), body: z.string().max(10_000).optional() })` strips unknown keys. Patch: `.partial().refine(p => p.title !== undefined || p.body !== undefined)`. Validate `req.params` with a UUID regex before it reaches Postgres.
</details>

## Rate limiting

<details><summary>Hint 1</summary>

Module 19's fixed window is enough. What matters is the key and where the middleware sits.
</details>

<details><summary>Hint 2</summary>

A Lua script makes INCR + EXPIRE atomic: `local n = redis.call('INCR', KEYS[1]) if n == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end return {n, redis.call('TTL', KEYS[1])}`. Run it with `redis.eval(script, 1, key, windowSeconds)`.
</details>

<details><summary>Hint 3</summary>

Key = `${prefix}rl:login:` + sha256(`${email.trim().toLowerCase()}|${req.ip}`). If `count > max`, throw a 429 `HttpError` with `{ "Retry-After": String(ttl) }`. Mount it as route middleware on `POST /auth/login` before the controller.
</details>

## Readiness and shutdown

<details><summary>Hint 1</summary>

A readiness check that hangs is as bad as one that's missing. Put a timeout around each dependency check.
</details>

<details><summary>Hint 2</summary>

`Promise.race([pool.query("SELECT 1"), timeoutPromise(1000)])`, and the same for `redis.ping()`. Run both in parallel with `Promise.all`. For the lifecycle, copy your module 26 solution and swap the logging calls to pino's `logger.info(fields, msg)` order.
</details>
