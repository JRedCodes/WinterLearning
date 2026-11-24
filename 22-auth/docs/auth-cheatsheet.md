# Auth cheat sheet

## Status codes

| Situation | Status | Notes |
|---|---|---|
| No / invalid / expired credentials | 401 | Add a `WWW-Authenticate` header |
| Wrong email or password | 401 | Same body for both cases |
| Logged in, but role not allowed | 403 | |
| Logged in, resource belongs to someone else | 404 | 403 only if the caller may know it exists |
| Too many login attempts | 429 | `Retry-After` header |

## Passwords (Node)

```ts
import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
// hash:   salt = randomBytes(16); key = scrypt(pw, salt, 64, { N: 2**14, r: 8, p: 1 })
// store:  scrypt$N$r$p$<salt b64>$<key b64>
// verify: re-derive with stored params → timingSafeEqual(actual, expected)
```

- OWASP's current minimum for scrypt: N=2^17, r=8, p=1 (128 MiB, set `maxmem`). We use 2^14 to keep tests fast; measure on your hardware and aim for ~100–250 ms per hash in production.
- argon2id (npm `argon2`): `argon2.hash(pw, { type: argon2.argon2id })`, `argon2.verify(hash, pw)`.
- bcrypt: cost ≥ 10–12; passwords over 72 bytes are truncated.

## Session cookie

```
Set-Cookie: sid=<base64url 32 bytes>; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=604800
Set-Cookie: sid=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0      ← logout
```

## Redis session layout (this module)

```
SET    wl:22:session:<id>         '{"userId":"…","createdAt":…}' EX 3600
SADD   wl:22:user-sessions:<uid>  <id>        + EXPIRE
GETEX  wl:22:session:<id> EX 3600              ← read + slide expiry
DEL    wl:22:session:<id> ; SREM wl:22:user-sessions:<uid> <id>   ← logout
```

## JWT verification checklist

- [ ] Algorithm pinned by the server (`algorithms: ["HS256"]`), `none` rejected
- [ ] Signature checked with a constant-time compare before reading claims
- [ ] `exp` required and checked (small clock-skew leeway is fine)
- [ ] `iss` and `aud` checked when more than one issuer/audience exists
- [ ] Key id (`kid`) supported for rotation
- [ ] No secrets or sensitive personal data in the payload
- [ ] Access token TTL 5–15 min; refresh tokens rotated, stored hashed, reuse detected

```ts
// jose (recommended library)
import { jwtVerify } from "jose";
const { payload } = await jwtVerify(token, secretKey, { algorithms: ["HS256"], issuer: "wl", audience: "wl-api" });
```

## Login hardening

- Same 401 body for unknown email and wrong password
- Dummy hash verify when the user doesn't exist (timing)
- Rotate session id on login; destroy the old one
- Rate limit per IP + per account (module 19)
- Never log passwords, session ids or tokens

## curl

```bash
curl -i -c jar.txt localhost:3000/auth/login -H 'content-type: application/json' \
  -d '{"email":"ada@example.com","password":"correct horse battery staple"}'
curl -i -b jar.txt localhost:3000/auth/me
curl -i -b jar.txt -X POST localhost:3000/auth/logout
# decode a JWT payload
cut -d. -f2 <<<"$TOKEN" | tr '_-' '/+' | base64 -d 2>/dev/null; echo
```

See also: [../../docs/cheatsheets/http.md](../../docs/cheatsheets/http.md) · [../../docs/cheatsheets/redis.md](../../docs/cheatsheets/redis.md)
