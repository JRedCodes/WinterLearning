# API spec · Link Preview Service

This is the contract the acceptance tests check. The types are in `challenge/src/contract.ts`.

## Conventions

- JSON in, JSON out. Success bodies: `{ "data": ... }`. Error bodies: `{ "error": { "code": "...", "message": "..." } }`.
- All `/previews` routes require `X-API-Key: <key>` (one of `options.apiKeys`).
- All `/previews` routes are rate limited **per API key** (`options.rateLimit`), shared across instances that share Redis and a namespace.

## Preview object (`data`)

```jsonc
// ready
{ "url": "https://example.com/post", "status": "ready",
  "title": "A post", "description": "About it" /* or null */, "imageUrl": "https://..." /* or null */,
  "fetchedAt": "2026-11-24T10:00:00.000Z" }

// failed
{ "url": "https://example.com/gone", "status": "failed", "error": "404 Not Found",
  "fetchedAt": "2026-11-24T10:00:00.000Z" }

// pending
{ "url": "https://example.com/new", "status": "pending", "jobId": "fetch-3f1c..." }
```

`url` is always the **normalized** URL: parsed with `new URL()`, fragment removed, serialized with `toString()`.

## `GET /health`

`200 { "status": "ok" }`. No API key, not rate limited.

## `POST /previews`

Body: `{ "url": string }`

| Case | Status | Body |
|---|---|---|
| Missing/invalid key | 401 | `UNAUTHORIZED` |
| Over the limit | 429 + `Retry-After` (seconds ≥ 1) | `RATE_LIMITED` |
| `url` missing, not a string, not absolute, not http(s), longer than 2048 chars | 400 | `VALIDATION_FAILED` |
| Preview exists (ready or failed) | 200 | preview |
| Otherwise | 202 + `Location: /previews?url=<encoded normalized url>` | pending preview; the same `jobId` for every caller until the job finishes |

Exactly one fetch per normalized URL, however many concurrent POSTs arrive.

## `GET /previews?url=<url>`

| Case | Status | Body |
|---|---|---|
| Missing/invalid key | 401 | `UNAUTHORIZED` |
| Over the limit | 429 | `RATE_LIMITED` |
| `url` missing/invalid | 400 | `VALIDATION_FAILED` |
| Preview exists | 200 | preview |
| Job in progress | 202 | pending preview |
| Never requested | 404 | `NOT_FOUND` |

GET never enqueues work.

## Worker behavior

- Calls `options.fetcher.fetch(normalizedUrl)`.
- Success → persist in Postgres (survives a new system with an empty Redis namespace) and cache in Redis as a string key under `wl:21:<namespace>:` with TTL ≤ `cacheTtlSeconds`.
- Plain `Error` → retried, up to `options.jobs.attempts` total attempts, exponential backoff from `options.jobs.backoffMs`.
- `PermanentFetchError` → no retry.
- After the final attempt (or a permanent error) → preview stored as `failed` with the error message.

## Lifecycle

- `createSystem(options)` runs migrations (safe to run repeatedly), connects, starts the worker and resolves with `{ app, close }`.
- `close()` waits for in-flight jobs (an active fetch completes and is persisted), then releases every connection. Calling it twice is safe.
- Every Redis key the system creates starts with `wl:21:<namespace>:`, including BullMQ's (use its `prefix` option).
