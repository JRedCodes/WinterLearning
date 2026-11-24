# Hints · Web Security

Open one hint at a time. Give each a real try before opening the next.

## Finding 1: search

<details><summary>Hint 1</summary>

Find where the search term meets SQL. Follow `GET /files` from the controller down.
</details>

<details><summary>Hint 2</summary>

`FileRepository.search` builds the SQL text with template literals. Everything else in that file uses `$1, $2` placeholders. Why is this one different? (Optional filters make people reach for string building.)
</details>

<details><summary>Hint 3</summary>

Build the SQL text from *fixed* fragments and push values into a `params` array: `params.push(\`%${term}%\`); sql += \` AND name ILIKE $${params.length}\``. Bonus: escape `%`, `_` and `\` in the term.
</details>

## Finding 2: download

<details><summary>Hint 1</summary>

What does `path.join("/storage", "7", "../../.env")` return? Try it in a Node REPL.
</details>

<details><summary>Hint 2</summary>

Two places to fix, for defence in depth: `FileService.download` reads the disk *before* checking that the user owns a file by that name; `FileStorage` never checks that the final path stays inside the user's folder.
</details>

<details><summary>Hint 3</summary>

Service: look up `files.findByName(ownerId, name)` first, 404 if missing, then read. Storage: `const dir = path.join(root, id); const full = path.resolve(dir, name); if (path.dirname(full) !== dir) throw new ValidationError(...)`. Make `root` absolute with `path.resolve` in the constructor.
</details>

## Finding 3: SSRF

<details><summary>Hint 1</summary>

All the work happens in `src/lib/urlImporter.ts`. List what it checks today: is the URL valid, does the host resolve. What does it *not* check?
</details>

<details><summary>Hint 2</summary>

You need: a scheme allowlist, a credentials check, a check of **every** resolved address against blocked ranges (Node's `net.BlockList` with `addSubnet`), `redirect: "manual"`, and a status check. Note `new URL("http://[::1]/").hostname` is `"[::1]"` (brackets!), and `new URL("http://[::ffff:127.0.0.1]/").hostname` is `"[::ffff:7f00:1]"`.
</details>

<details><summary>Hint 3</summary>

Write `isBlockedAddress(ip)`: strip brackets; if `isIP(ip) === 4` check the IPv4 list; if 6, first detect `::ffff:` mapped addresses (both dotted and hex forms) and check the embedded IPv4, else check the IPv6 list (`::`, `::1`, `fc00::/7`, `fe80::/10`, `ff00::/8`). In `download`: validate → `fetch(url, { redirect: "manual", ... })` → if `status` is 3xx or `!res.ok`, throw `UpstreamError`.
</details>

## Finding 4: profile update

<details><summary>Hint 1</summary>

Trace `PATCH /me`: what object reaches `UserRepository.update`, and how are its keys used?
</details>

<details><summary>Hint 2</summary>

The controller spreads the whole body; the repository turns every key into a column name. Fix both ends: an allowlist at the boundary, and a repository method that doesn't build SQL from keys.
</details>

<details><summary>Hint 3</summary>

`z.object({ displayName: ..., email: z.string().refine(isValidEmail) }).strict()` in the controller; a repository `updateProfile(id, { displayName?, email? })` with `SET display_name = COALESCE($2, display_name), email = COALESCE($3, email)`.
</details>

## Finding 5: settings

<details><summary>Hint 1</summary>

Paste this into a Node REPL: `const t = {}; const s = JSON.parse('{"__proto__":{"x":1}}'); t["__proto__"].x = s["__proto__"].x; ({}).x`. Now read `src/lib/deepMerge.ts`.
</details>

<details><summary>Hint 2</summary>

`target["__proto__"]` is `Object.prototype`, and `isObject(Object.prototype)` is true, so the merge walks right into it. `constructor` is the other path in.
</details>

<details><summary>Hint 3</summary>

Skip the keys `__proto__`, `constructor`, `prototype`. Only recurse into existing values that are *own* properties (`Object.hasOwn`) and plain objects (prototype is `Object.prototype` or `null`). Write with `Object.defineProperty` for good measure.
</details>

## Finding 6: email validation

<details><summary>Hint 1</summary>

Time `isValidEmail("a".repeat(n) + "!")` for n = 20, 24, 28. What shape in the regex makes the time double per character?
</details>

<details><summary>Hint 2</summary>

`([a-zA-Z0-9]+[._-]?)+` is a quantified group containing a quantifier, and the separator is optional, so `aaaa` can be split into groups in exponentially many ways.
</details>

<details><summary>Hint 3</summary>

Check `value.length <= 254` first. Then use a pattern where each character can match only one way, with bounded quantifiers, e.g. a first character, a bounded middle class, a last character, `@`, then labels of `{1,63}`.
</details>

## Finding 7: CORS

<details><summary>Hint 1</summary>

`src/middleware/cors.ts` receives the allowed origins. Does it use them?
</details>

<details><summary>Hint 2</summary>

Compare the request's `Origin` with a `Set` of allowed origins (exact match). Only then echo it back with `Allow-Credentials`. Always `res.vary("Origin")`.
</details>

<details><summary>Hint 3</summary>

Preflights from disallowed origins: still end the request (204) but **without** any `Access-Control-Allow-*` headers. The browser then blocks the real request.
</details>

## Finding 8: headers

<details><summary>Hint 1</summary>

`helmet` is already in `package.json`.
</details>

<details><summary>Hint 2</summary>

Order matters: register it before anything that can end the response, so 401s and 404s get the headers too. And `app.disable("x-powered-by")`.
</details>

## DECISIONS.md

<details><summary>Hint</summary>

Read [docs/ssrf-defence.md](docs/ssrf-defence.md). Options to compare: domain allowlist, IP blocklist after DNS (what you built), egress proxy, network isolation. The big consequence to mention is DNS rebinding.
</details>
