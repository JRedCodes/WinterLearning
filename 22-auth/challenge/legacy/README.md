# legacy/: the old "docs-lite" service

This is the service the new auth code (in `../src`) is replacing. It is still in production
for a few months, so it has to be patched, not rewritten.

- `app.ts`: Express app, all routes inline (yes, it predates our layering rules)
- `lib/jwt.ts`: home-grown HS256 JWT signing/verification
- `lib/passwords.ts`: password hashing
- `store.ts`: in-memory store (the real one was a MySQL table with the same shape)

Endpoints:

| Method | Path | Auth | Notes |
|---|---|---|---|
| POST | `/register` | – | `{ email, password }` → 201 `{ id, email }` |
| POST | `/login` | – | `{ email, password }` → 200 `{ token }` |
| GET | `/me` | Bearer | → `{ id, email }` |
| POST | `/documents` | Bearer | `{ title, body }` → 201 document |
| GET | `/documents/:id` | Bearer | → document |

See Part B of [`../../CHALLENGE.md`](../../CHALLENGE.md) for the security report.
