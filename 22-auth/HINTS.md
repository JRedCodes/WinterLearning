# Hints · Authentication & Authorization

Open one hint at a time. Give each a real try before opening the next.

## TODO 1: password hashing

<details><summary>Hint 1</summary>

`crypto.scrypt(password, salt, keyLength, options, callback)` is callback-based. Wrap it in a `new Promise(...)` so you can pass `{ N, r, p, maxmem }` as options. With N=16384 and r=8 you need `maxmem` above `128 * N * r` bytes, or Node throws.
</details>

<details><summary>Hint 2</summary>

Build the string with `["scrypt", N, r, p, salt.toString("base64"), key.toString("base64")].join("$")`. For verification, `split("$")`, check there are exactly 6 parts, the scheme is `scrypt`, and the numbers are positive integers. Decode the salt and the expected key, and derive a key **of the same length as the expected one** using the parsed `N`, `r`, `p`.
</details>

<details><summary>Hint 3</summary>

```
verify(password, stored):
  parts = stored.split("$"); if parts.length != 6 → false
  [scheme, n, r, p, salt64, hash64] = parts
  if scheme != "scrypt" or n/r/p not /^\d+$/ → false
  expected = Buffer.from(hash64, "base64"); if empty → false
  try: actual = await derive(password, Buffer.from(salt64, "base64"), expected.length, {N, r, p})
  catch: return false     // e.g. N not a power of two
  return timingSafeEqual(actual, expected)
```
</details>

## TODO 2: Redis session store

<details><summary>Hint 1</summary>

`randomBytes(32).toString("base64url")` gives a 43-character, URL- and cookie-safe id. Store `JSON.stringify({ userId, createdAt })` at `this.sessionKey(id)`.
</details>

<details><summary>Hint 2</summary>

`redis.multi().set(key, value, "EX", ttl).sadd(userKey, id).expire(userKey, ttl).exec()`. For `get`, `redis.getex(key, "EX", ttl)` reads and refreshes the TTL in one command (or use `get` + `expire`).
</details>

<details><summary>Hint 3</summary>

`destroy(id)` has to read the session first to know which user set to `SREM` from. `destroyAllForUser`: `SMEMBERS` the set, then one `DEL` with all session keys (Redis `DEL` returns how many keys existed, which is exactly the number you must return), then `DEL` the set. Handle the empty set: `DEL` with zero keys is an error.
</details>

## TODO 3: cookies

<details><summary>Hint 1</summary>

It's just string building. Put shared attributes (`Path=/`, `HttpOnly`, `SameSite=Lax`, and `Secure` when enabled) in a helper used by both functions.
</details>

<details><summary>Hint 2</summary>

`[\`sid=${id}\`, ...attrs, \`Max-Age=${n}\`].join("; ")`. The clearing variant is the same with an empty value and `Max-Age=0`.
</details>

## TODO 4: auth service

<details><summary>Hint 1</summary>

Look at what's already available: `normalizeEmail` and `toPublicUser` in `domain/user.ts`, `InvalidCredentialsError` in `domain/errors.ts`, and the repository already throws `EmailTakenError` for duplicates. You don't need a "does this email exist?" query before inserting.
</details>

<details><summary>Hint 2</summary>

For timing: store a `Promise<string>` field that you fill on first use with `this.deps.hasher.hash("some throwaway value")`. When the user isn't found, `await this.deps.hasher.verify(password, await dummy)` and then throw the same `InvalidCredentialsError` as for a wrong password.
</details>

<details><summary>Hint 3</summary>

```
login(email, password, previousSessionId):
  user = users.findByEmail(normalizeEmail(email))
  if !user: verify(password, dummyHash); throw InvalidCredentials
  if !verify(password, user.passwordHash): throw InvalidCredentials
  if previousSessionId: sessions.destroy(previousSessionId)
  session = sessions.create(user.id)
  return { user: toPublicUser(user), sessionId: session.id }
```
</details>

## TODO 5: middleware

<details><summary>Hint 1</summary>

`authenticate` must be `async` (it awaits Redis and Postgres). Express 5 forwards a rejected promise to the error handler for you. Every path ends in `next()`; it never sends a response itself.
</details>

<details><summary>Hint 2</summary>

`parseCookies(req.headers.cookie)[SESSION_COOKIE]` → `sessions.get(id)` → `users.findById(session.userId)`. If the user is gone, `sessions.destroy(session.id)` before continuing anonymously.
</details>

<details><summary>Hint 3</summary>

`requireRole`: `const user = currentUser(res)` already throws the 401 for you. Then `if (!roles.includes(user.role)) throw new ForbiddenError()`.
</details>

## TODO 6: document policy

<details><summary>Hint 1</summary>

Three of the four methods start the same way: load the document, and pretend it doesn't exist if the actor may not see it. Write that once as a private helper.
</details>

<details><summary>Hint 2</summary>

"May see" = owner or admin. `update` adds one more rule after that: only the owner, else `ForbiddenError`. `list` chooses between `listAll()` and `listByOwner(actor.id)`.
</details>

## TODO 7: legacy bugs

<details><summary>Hint 1 (all findings)</summary>

Read the four files in `legacy/` slowly, asking "what does an attacker control here?" The token header, the token payload, the URL id and the login body are all attacker-controlled.
</details>

<details><summary>Hint 2 (finding 1)</summary>

Look at how `verifyToken` chooses the hash function, and what happens when that choice is `null`. Then look at which claims it checks before returning the payload. The third argument is unused for a reason.
</details>

<details><summary>Hint 3 (finding 1)</summary>

Pin the algorithm: `if (header.alg !== "HS256") return null`. Always compute the HMAC, compare with `timingSafeEqual` (check lengths first), then require `typeof exp === "number"` and `nowSeconds < exp` (a small skew allowance is fine).
</details>

<details><summary>Hint 2 (findings 2–4)</summary>

- Finding 2: the document route checks that *a* token is valid but never compares `doc.ownerId` with the token's `sub`.
- Finding 3: compare the two early returns in `/login`.
- Finding 4: `legacy/lib/passwords.ts`. You already wrote a better implementation in TODO 1.
</details>

## TODO 8: DECISIONS.md

<details><summary>Hint 1</summary>

Use the questions at the end of [docs/sessions-vs-jwt.md](docs/sessions-vs-jwt.md). The scenario gives you the facts: first-party web app, logout and "log out everywhere" required, Redis already in the stack.
</details>
