# Designing error responses

Your API's error format is a contract with every client. Changing it later breaks them, so it's worth getting right early.

## The shape used in this repo

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "title must not be empty",
    "requestId": "8e0c7a52-…"
  }
}
```

- **`code`**: stable, machine-readable, SCREAMING_SNAKE. Clients branch on this. Never change a code's meaning.
- **`message`**: human-readable, safe to show a developer. It may change wording over time.
- **`requestId`**: lets support or on-call engineers find the matching server logs in seconds.

Later modules add optional fields, like `details` (a per-field list of validation issues, module 07) and `retryAfter` (rate limiting, module 19).

## Status codes you'll use most

| Status | When | Example code |
|---|---|---|
| 400 | Malformed request / failed validation | `VALIDATION_ERROR`, `INVALID_JSON` |
| 401 | Not authenticated (who are you?) | `UNAUTHENTICATED` |
| 403 | Authenticated but not allowed | `FORBIDDEN` |
| 404 | Resource or route doesn't exist | `NOT_FOUND`, `ROUTE_NOT_FOUND` |
| 409 | Conflicts with current state (duplicate, version mismatch) | `CONFLICT` |
| 422 | Well-formed but semantically invalid (some teams use this instead of 400) | `UNPROCESSABLE` |
| 429 | Rate limited | `RATE_LIMITED` |
| 500 | Bug | `INTERNAL_ERROR` |
| 503 | Dependency down / overloaded | `SERVICE_UNAVAILABLE` |

## Standards you'll meet

- **RFC 9457 "Problem Details"** (`application/problem+json`) defines `type`, `title`, `status`, `detail` and `instance`. Some companies adopt it. The ideas are the same as ours: stable identifier, human message, correlation id.
- **GraphQL** returns 200 with an `errors` array, which is a different philosophy. You'll see the trade-off discussed in [module 23](../../23-api-design/README.md).

## Rules of thumb

1. Same shape for **every** error, including 404s for unknown routes and JSON parse errors.
2. 4xx = the client can fix it, 5xx = we have to fix it.
3. Don't leak internals in 5xx responses.
4. Don't leak *existence* where it matters: for a private resource, a 404 can be better than a 403 because it doesn't confirm the resource exists.
