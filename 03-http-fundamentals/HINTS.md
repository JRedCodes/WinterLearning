# Hints · HTTP Fundamentals

Open one hint at a time. Give each a real try before opening the next.

## TODO 1: Router

<details><summary>Hint 1</summary>

Store routes in an array of `{ method, segments, handler }`, where `segments` is `pattern.split("/")`. `"/bookmarks/:id".split("/")` is `["", "bookmarks", ":id"]`, and a request path splits the same way, so you can compare position by position.
</details>

<details><summary>Hint 2</summary>

Write a helper `matchSegments(patternSegs, pathSegs)` that returns the params object or `undefined`. Then in `match`, loop over routes: if the path matches and the method matches (or the request is HEAD and the route is GET), return found. If only the path matches, remember the route's method in a `Set` of allowed methods (adding `"HEAD"` when you add `"GET"`).
</details>

<details><summary>Hint 3</summary>

In `matchSegments`: lengths must be equal; for `:name` segments, reject `""`, then `try { params[name] = decodeURIComponent(actual) } catch { return undefined }`; for literal segments, require equality. After the loop in `match`: `allowed.size > 0 ? { kind: "method-not-allowed", allowed: [...allowed].sort() } : { kind: "not-found" }`.
</details>

## TODO 2: ETags

<details><summary>Hint 1</summary>

`createHash("sha1").update(body).digest("base64url")` from `node:crypto` gives a short fingerprint. Don't forget the literal double quotes around it.
</details>

<details><summary>Hint 2</summary>

For matching: handle `undefined` and `"*"` first. Then split the header on `,`, trim each entry, strip a leading `W/` from each entry and from the etag, and check whether any entry equals the etag.
</details>

## TODO 3: Body and server wiring

<details><summary>Hint 1</summary>

The media type is `(req.headers["content-type"] ?? "").split(";")[0]`, trimmed and lowercased. Check it before reading any bytes.
</details>

<details><summary>Hint 2</summary>

`for await (const chunk of req)` yields Buffers. Keep a running byte count and throw the 413 the moment it passes the limit, *before* pushing the chunk. Also check `Number(req.headers["content-length"])` up front for a fast rejection. `Buffer.concat(chunks).toString("utf8")` then `JSON.parse` inside a `try`.
</details>

<details><summary>Hint 3</summary>

In `createServer`, the listener looks like:

```ts
try {
  const url = new URL(req.url ?? "/", "http://localhost");
  const match = router.match(req.method ?? "GET", url.pathname);
  if (match.kind === "not-found") throw new HttpError(404, "ROUTE_NOT_FOUND", ...);
  if (match.kind === "method-not-allowed") throw new HttpError(405, ..., { Allow: match.allowed.join(", ") });
  await match.handler({ req, res, url, params: match.params });
} catch (error) {
  // HttpError → sendError(res, status, code, message, headers)
  // else → console.error + generic 500
}
```
</details>

## TODO 4: Validation and handlers

<details><summary>Hint 1</summary>

Validation: check `typeof` for each field, then `new URL(url)` inside a `try`, then `parsed.protocol` against `"http:"` and `"https:"` (note the colon). For tags, build a new array: trim, lowercase, skip if already present.
</details>

<details><summary>Hint 2</summary>

Each handler is short: `const input = parseBookmarkInput(await readJsonBody(req, maxBodyBytes))`, call the store, and if the store returns `undefined`/`false`, `throw new HttpError(404, "NOT_FOUND", "Bookmark not found")`.
</details>

<details><summary>Hint 3</summary>

POST: `sendJson(res, 201, { data: bookmark }, { Location: `/bookmarks/${bookmark.id}` })`. DELETE: `sendEmpty(res, 204)`. For the tag filter, `url.searchParams.get("tag")` returns `string | null`; lowercase it before passing it to `store.list({ tag })`.
</details>

## TODO 5: Conditional GET

<details><summary>Hint 1</summary>

You need the exact bytes of the body to hash, so serialize first: `const payload = JSON.stringify({ data: bookmark })`.
</details>

<details><summary>Hint 2</summary>

`const headers = { ETag: computeEtag(payload), "Cache-Control": "no-cache" }`. If `ifNoneMatchMatches(req.headers["if-none-match"], etag)` → `sendEmpty(res, 304, headers)`, otherwise `sendRaw(res, 200, payload, headers)`. HEAD needs no special code: Node drops the body.
</details>
