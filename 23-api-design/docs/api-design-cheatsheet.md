# API design cheat sheet

## URLs

```
GET    /v1/projects                         list (cursor-paginated)
POST   /v1/projects                         create → 201 + Location
GET    /v1/projects/{projectId}             read
GET    /v1/projects/{projectId}/tasks       list children (one level of nesting)
POST   /v1/projects/{projectId}/tasks       create child (Idempotency-Key)
GET    /v1/tasks/{taskId}                   child gets its own top-level URL
PATCH  /v1/tasks/{taskId}                   merge patch + If-Match
DELETE /v1/tasks/{taskId}                   → 204
POST   /v1/tasks/{taskId}/archive           non-CRUD action
```

Plural nouns · lowercase-hyphen paths · one JSON casing · no verbs · nest ≤ 1 level.

## Status codes

| | |
|---|---|
| 200 / 201 / 202 / 204 | ok / created / accepted (async) / no content |
| 304 | not modified (If-None-Match hit) |
| 400 | invalid input |
| 401 / 403 / 404 | unauthenticated / forbidden / not found (or not yours) |
| 409 | conflict (duplicate, idempotency key in flight) |
| 412 / 428 | If-Match mismatch / If-Match required |
| 415 | unsupported Content-Type |
| 422 | semantically invalid (idempotency key reused with another body) |
| 429 | rate limited (+ Retry-After) |
| 500 / 503 | bug / temporarily unavailable |

## Method properties

| | Safe | Idempotent |
|---|---|---|
| GET, HEAD, OPTIONS | ✅ | ✅ |
| PUT, DELETE | ❌ | ✅ |
| POST, PATCH | ❌ | ❌ (make POST retry-safe with Idempotency-Key) |

## Problem Details (RFC 9457)

```http
Content-Type: application/problem+json
{ "type": "https://api.example/problems/validation-error", "title": "Validation Failed",
  "status": 400, "detail": "…", "instance": "/v1/projects",
  "errors": [{ "pointer": "/name", "detail": "Required" }] }
```

## Pagination

```
GET /v1/x?limit=20&cursor=<opaque>
→ { "data": [...], "page": { "limit": 20, "nextCursor": "…" | null } }
```

```sql
WHERE (created_at, id) > ($1, $2) ORDER BY created_at, id LIMIT $3 + 1
```

Filters: `?status=done` · Sort: `?sort=-createdAt` (enum of indexed fields).

## Conditional requests

```
GET   → ETag: "3"
GET   If-None-Match: "3"   → 304 (weak comparison: W/"3" also hits)
PATCH If-Match: "3"        → 200 ETag: "4"  |  412 if stale  |  428 if missing
PATCH If-Match: *          → any current version
```

SQL: `UPDATE … SET …, version = version + 1 WHERE id = $1 AND version = $2 RETURNING *`

## Idempotency-Key

```
POST … Idempotency-Key: <uuid>
  first:             claim key (NX) → run → store {status, headers, body}
  retry, same body:  replay + Idempotent-Replayed: true
  retry, diff body:  422
  still running:     409
  5xx:               release key (retry allowed)
  TTL:               ~24h, scope by account + endpoint
```

## OpenAPI 3.1 snippets

```yaml
type: [string, "null"]                    # nullable (3.1)
format: uuid | date | date-time | uri-reference
additionalProperties: false               # strict objects
$ref: "#/components/schemas/Problem"      # reuse
minProperties: 1                          # non-empty PATCH body
```

## Compatibility quick check

Safe: new endpoint · new optional request field · new response field · relaxed validation.
Breaking: remove/rename · type change · new required input · tighter validation · new error type for an old case.

## curl

```bash
curl -i localhost:3000/v1/projects -H 'content-type: application/json' -d '{"name":"Launch"}'
curl -i -X POST localhost:3000/v1/projects/$P/tasks -H 'content-type: application/json' \
     -H 'Idempotency-Key: 6f1c…' -d '{"title":"Write spec"}'
curl -i localhost:3000/v1/tasks/$T -H 'If-None-Match: "1"'
curl -i -X PATCH localhost:3000/v1/tasks/$T -H 'content-type: application/merge-patch+json' \
     -H 'If-Match: "1"' -d '{"status":"done"}'
```

See also: [../../docs/cheatsheets/http.md](../../docs/cheatsheets/http.md)
