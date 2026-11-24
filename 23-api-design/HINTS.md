# Hints · API Design

Open one hint at a time. Give each a real try before opening the next.

## TODO 1: the OpenAPI document

<details><summary>Hint 1</summary>

Start with `components`: write `Problem`, `TaskStatus`, `TaskPriority`, `Task`, `NewTask`, `TaskPatch` and `TaskList`, then the reusable `responses` (`BadRequest`, `NotFound`) and `parameters` (`TaskId`, `IdempotencyKey`). Paths become short once the components exist. Run `make lint-spec` often: its failure messages name exactly what's missing.
</details>

<details><summary>Hint 2</summary>

- Error responses: define `components.responses.NotFound` with `content: application/problem+json: schema: $ref: "#/components/schemas/Problem"`, then `"404": { $ref: "#/components/responses/NotFound" }` everywhere. 409/412/422/428 can be inline, but their schema must still be the `$ref`.
- Nullable in 3.1: `type: [string, "null"]`. A non-empty PATCH: `minProperties: 1`.
- Headers on a response: `headers: { ETag: { schema: { type: string } } }`. Header *parameters* (request): `{ name: If-Match, in: header, required: true, schema: { type: string } }`.
- PATCH can document two request media types: `application/merge-patch+json` and `application/json`.
</details>

<details><summary>Hint 3</summary>

Conformance failures are your friend. "status 304 is not documented" means add a `"304"` response (with a description and no `content`). "Content-Type application/problem+json is not documented" means that status's response lacks the problem media type. "must NOT have additional properties" means the code returns a field your schema doesn't list (or the other way round).
</details>

## TODO 2: problem details

<details><summary>Hint 1</summary>

Every `DomainError` has a `kind`. One lookup table `kind → { status, title }` replaces a chain of `instanceof` checks.
</details>

<details><summary>Hint 2</summary>

`res.status(s).setHeader("Content-Type", "application/problem+json")` and *then* `res.json(body)`. Only add `errors` when `err instanceof ValidationError && err.errors.length > 0`. Use `req.originalUrl` (includes the query string) for `instance`, and `req.path` in the 404 detail.
</details>

<details><summary>Hint 3</summary>

The simplest `notFoundHandler` calls `next()` with an error, so all formatting happens in one place. You need a way to tell the route 404 apart (its detail differs), e.g. build the problem directly in `notFoundHandler`, or check for a specific error.
</details>

## TODO 3: cursors

<details><summary>Hint 1</summary>

`Buffer.from(JSON.stringify(x)).toString("base64url")` and `JSON.parse(Buffer.from(raw, "base64url").toString())`.
</details>

<details><summary>Hint 2</summary>

`Buffer.from(..., "base64url")` doesn't throw on garbage, it just skips invalid characters. Check `/^[A-Za-z0-9_-]+$/` first, wrap `JSON.parse` in try/catch, then check each field's type and `Date.parse(createdAt)`.
</details>

## TODO 4: task service

<details><summary>Hint 1</summary>

`list` is `ProjectService.list` plus three things: check the project exists, compare `cursor.sort` with `query.sort`, and pass `status` and `sort` to `listByProject`.
</details>

<details><summary>Hint 2</summary>

For `update`: load the task (404), then `if (expected !== "*" && !expected.includes(current.version)) throw new PreconditionFailedError()`. Then `updateIfVersion(id, current.version, patch, this.clock())`, and a `null` result is also a 412.
</details>

## TODO 5: ETags and the controller

<details><summary>Hint 1</summary>

Split the header on commas and match each part with `/^\s*(W\/)?"([^"]*)"\s*$/`. That gives you "weak?" and the value for each tag.
</details>

<details><summary>Hint 2</summary>

`parseIfMatch` keeps only strong tags whose value is all digits. `ifNoneMatchHits` ignores the `W/` prefix. Both treat `*` specially.
</details>

<details><summary>Hint 3</summary>

```
get:    task = service.get(id); setHeader(ETag)
        if ifNoneMatchHits(req.get("If-None-Match"), task.version) → 304 .end()
        else res.json(task)
update: expected = parseIfMatch(req.get("If-Match")); undefined → throw PreconditionRequiredError
        patch = parseInput(TaskPatchBody, req.body)
        task = service.update(id, patch, expected); setHeader(ETag, new version); res.json(task)
```
</details>

## TODO 6: idempotency middleware

<details><summary>Hint 1</summary>

Write it in the order of the numbered steps in the file's comment. Make the middleware `async`: throwing inside it reaches the problem handler (Express 5).
</details>

<details><summary>Hint 2</summary>

To capture the body: `const original = res.json.bind(res); res.json = (body) => { captured = body; return original(body); }`. To capture the outcome: `res.on("finish", () => { ... res.statusCode ... res.getHeader("Location") ... })`.
</details>

<details><summary>Hint 3</summary>

When replaying, also restore the original `Content-Type`, so a replayed 404 is still `application/problem+json`. Set `Idempotent-Replayed: true`, send the stored status and body, and don't call `next()`.
</details>

## TODO 7: DECISIONS.md

<details><summary>Hint 1</summary>

Read [docs/api-evolution.md](docs/api-evolution.md). The scenario gives you the facts: slow-updating mobile apps, partners you don't control, and a past incident caused by a "harmless" rename.
</details>
