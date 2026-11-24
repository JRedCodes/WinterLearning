# HTTP & curl cheat sheet

> Methods, status codes, headers and curl. Taught in [03 · HTTP Fundamentals](../../03-http-fundamentals/README.md) and applied in [05 · Express Basics](../../05-express-basics/README.md) and [23 · API Design](../../23-api-design/README.md).

## Methods

| Method | Purpose | Safe? | Idempotent? | Body? |
|---|---|---|---|---|
| `GET` | read | yes | yes | no |
| `HEAD` | GET without the body (headers only) | yes | yes | no |
| `POST` | create / trigger an action | no | **no** (use an `Idempotency-Key`) | yes |
| `PUT` | replace a resource entirely | no | yes | yes |
| `PATCH` | partial update | no | not guaranteed | yes |
| `DELETE` | remove | no | yes | rarely |
| `OPTIONS` | ask what's allowed (CORS preflight) | yes | yes | no |

*Safe* = doesn't change server state. *Idempotent* = doing it twice has the same effect as once (so retries are OK).

## Status codes you'll use

| Code | Meaning | Typical use |
|---|---|---|
| **200** OK | success with body | GET, PATCH |
| **201** Created | new resource, add `Location` header | POST |
| **202** Accepted | queued for async work | enqueue a job (modules 20, 21) |
| **204** No Content | success, empty body | DELETE |
| **301 / 308** | permanent redirect (308 keeps method) | moved URLs |
| **302 / 307** | temporary redirect (307 keeps method) | URL shortener (module 31) |
| **304** Not Modified | client's cached copy is fresh | `If-None-Match` matched the ETag |
| **400** Bad Request | malformed or invalid input | validation errors, bad JSON |
| **401** Unauthorized | not authenticated (who are you?) | missing/invalid session or token |
| **403** Forbidden | authenticated but not allowed | wrong role |
| **404** Not Found | no such resource (also used to hide existence) | unknown id, IDOR protection |
| **405** Method Not Allowed | path exists, method doesn't; send `Allow` | `DELETE /health` |
| **409** Conflict | state conflict | duplicate email, double booking |
| **412** Precondition Failed | `If-Match` ETag didn't match | optimistic concurrency (module 23) |
| **413** Content Too Large | body exceeds limit | `express.json({ limit })` |
| **415** Unsupported Media Type | wrong `Content-Type` | sent text to a JSON endpoint |
| **422** Unprocessable Content | well-formed but violates business rules | insufficient stock |
| **429** Too Many Requests | rate limited; send `Retry-After` | module 19 |
| **500** Internal Server Error | bug; generic message, log details | unexpected exceptions |
| **502 / 504** | bad gateway / gateway timeout | upstream failed or too slow |
| **503** Service Unavailable | overloaded or not ready | readiness failing, load shedding |

## Headers that matter

| Header | Direction | Notes |
|---|---|---|
| `Content-Type: application/json` | both | what the body is |
| `Accept` | request | what the client wants back |
| `Authorization: Bearer <token>` | request | token auth |
| `Cookie` / `Set-Cookie` | req / res | sessions; set `HttpOnly; Secure; SameSite=Lax` |
| `Location` | response | URL of a created resource or redirect target |
| `Cache-Control` | response | `no-store`, `private, max-age=60`, `public, max-age=31536000, immutable` |
| `ETag` / `If-None-Match` | res / req | conditional GET → 304 |
| `If-Match` | request | conditional write → 412 on mismatch |
| `Retry-After` | response | seconds to wait (429, 503) |
| `RateLimit-Limit/Remaining/Reset` | response | rate limit state |
| `Idempotency-Key` | request | dedupe retried POSTs |
| `X-Request-Id` | both | correlation id for logs (module 05, 24) |
| `traceparent` | request | W3C trace context (module 24) |
| `Access-Control-Allow-Origin` | response | CORS; never reflect any origin with credentials |
| `Allow` | response | allowed methods (with 405) |

## curl

```bash
curl -i localhost:3000/notes                       # include response headers
curl -sS localhost:3000/notes | jq                  # quiet but show errors; pretty-print
curl -X POST localhost:3000/notes \
  -H 'content-type: application/json' \
  -d '{"title":"hello"}'                            # JSON POST
curl -X PATCH localhost:3000/notes/1 -H 'content-type: application/json' -d '{"done":true}'
curl -X DELETE -i localhost:3000/notes/1
curl -I localhost:3000/notes/1                     # HEAD
curl -v localhost:3000/health                      # verbose: see request + TLS + headers
curl -H 'If-None-Match: "abc123"' -i localhost:3000/notes/1   # expect 304
curl -H "Authorization: Bearer $TOKEN" localhost:3000/me   # double quotes so the shell expands $TOKEN
curl -c cookies.txt -b cookies.txt -d @login.json -H 'content-type: application/json' localhost:3000/login
curl -w '%{http_code} %{time_total}s\n' -o /dev/null -s localhost:3000/health   # status + timing
curl -L localhost:3000/abc                         # follow redirects
curl --max-time 2 localhost:3000/slow              # client-side timeout
```

## Request/response anatomy

```
POST /notes HTTP/1.1              <- method, path (+query), version
Host: localhost:3000
Content-Type: application/json
Content-Length: 17
                                  <- blank line ends headers
{"title":"hello"}                 <- body

HTTP/1.1 201 Created
Location: /notes/1
Content-Type: application/json; charset=utf-8
X-Request-Id: 7b0c...

{"data":{"id":"1","title":"hello"}}
```

## This repo's error shape

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "title is required", "requestId": "7b0c...", "details": [{ "path": "title", "message": "Required" }] } }
```

## Gotchas

- 401 vs 403: 401 = "log in", 403 = "you're logged in but can't". Returning 404 instead of 403 hides whether a resource exists.
- `PATCH` with an empty body should be a 400, not a silent 200.
- Query params are strings (and may be arrays: `?a=1&a=2`). Validate and coerce.
- Browsers send a CORS **preflight** (`OPTIONS`) before non-simple requests; curl doesn't, so "works in curl, fails in browser" is usually CORS.
- Never put secrets or tokens in URLs; they end up in logs and browser history.
- Keep-alive means one TCP connection serves many requests; set server timeouts so idle sockets don't pile up.
