# 22 · Authentication & Authorization

> Most of the security incidents you'll read about don't involve clever crypto attacks. They come from a password stored with SHA-1, a token whose signature nobody checked, or an endpoint that returns *any* document as long as you're logged in. Auth is where small mistakes turn into headlines, so this module shows you the boring, correct way to do it.

**Time:** ~8h · **Challenge:** 🛠️ Build + find the bugs · **Prereqs:** [07 · Validation, Errors & Config](../07-validation-errors-config/README.md), [13 · Postgres from Node](../13-node-postgres/README.md), [17 · Redis Fundamentals](../17-redis-fundamentals/README.md) · **Services:** Postgres, Redis

## What you'll learn

- The difference between **authentication** (who are you?) and **authorization** (what may you do?), and where each one lives in a layered app
- How to store passwords: salts, slow memory-hard hashes (scrypt, argon2id, bcrypt), and why SHA-256 is the wrong tool
- **Server-side sessions**: opaque ids, cookie flags (`HttpOnly`, `Secure`, `SameSite`), a Redis session store, rotation on login
- **JWTs**: what's inside one, how signing works, the `alg` trap, expiry, and the revocation problem
- **Access + refresh tokens** with rotation and reuse detection
- **CSRF**, and why cookies need it while bearer tokens don't
- **RBAC vs ABAC**, ownership checks, and the most common API vulnerability: **IDOR**
- Timing attacks, user enumeration and login rate limiting
- What OAuth2 and OpenID Connect are for (and what they're not)

---

## 1. Authentication vs authorization

Two different questions, often confused because they happen in the same request:

| | Authentication (authn) | Authorization (authz) |
|---|---|---|
| Question | *Who is making this request?* | *Is this caller allowed to do this to this thing?* |
| Input | credentials: password, session cookie, token, client certificate | the identity from authn + the action + the resource |
| Failure status | **401 Unauthorized** (badly named: it means "unauthenticated") | **403 Forbidden** (or 404 to hide the resource exists) |
| Where in our layers | middleware that runs on every request | route guards (roles) + **service layer** (ownership) |

Here's how they fit into the middleware chain you built in module 05 and the layers from module 06:

```mermaid
flowchart LR
  R[request] --> A["authenticate()<br/>cookie → session → user<br/>(never rejects)"]
  A --> G{"route guard<br/>requireAuth / requireRole"}
  G -- "no user" --> E401[401]
  G -- "wrong role" --> E403[403]
  G -- ok --> C[controller]
  C --> S["service<br/>ownership / policy checks"]
  S -- "not yours" --> E404[404 / 403]
  S --> Repo[(repository)]
```

Notice three separate steps:

1. **`authenticate()`** figures out who's calling and attaches the user to `res.locals`. It doesn't reject anything, because some routes (like `/health` or `/auth/login`) are meant to be public.
2. **Route guards** (`requireAuth`, `requireRole("admin")`) reject whole categories of callers. They only need the user, not the resource.
3. **Policy checks in the service** answer "may *this* user touch *this* document?" That needs the document, so it can't happen in middleware without loading data in the wrong layer.

> 💡 A good test for where a check belongs: if it needs to load the resource, it belongs in the service. If it only needs the caller's identity, it can be middleware.

## 2. Storing passwords

You will never store a password. You store something that lets you **check** a password later, and that is useless to an attacker who steals your database. Database dumps leak all the time: through backups, misconfigured replicas, SQL injection, or a laptop. Design for the day the `users` table is public.

### Why not just SHA-256?

A first attempt is usually `sha256(password)`. It's one-way, so what's wrong?

1. **It's fast.** That's the problem. A single modern GPU computes billions of SHA-256 hashes per second. An attacker with your dump tries every word, every leaked password from previous breaches, and every common variation (`Summer2024!`) in minutes.
2. **No salt.** Two users with the password `letmein` get the same hash. The attacker cracks it once and gets both. Worse, they can use **precomputed tables** (rainbow tables) built before they ever saw your data.

### Salts

A **salt** is a random value (16 bytes is plenty), unique per password, stored next to the hash in plain text. You hash `password + salt`. Now:

- equal passwords produce different hashes,
- precomputed tables are useless (they'd need one per salt),
- the attacker must attack each user separately.

The salt isn't a secret. Its only job is to make every hash unique.

### Slow, memory-hard hashes

To fix "fast", use a function designed to be **expensive on purpose**, with a tunable cost:

| Algorithm | Notes |
|---|---|
| **argon2id** | Current first choice (winner of the Password Hashing Competition). Memory-hard, tunable time/memory/parallelism. Needs a native module in Node (`argon2`). |
| **scrypt** | Memory-hard, built into Node (`crypto.scrypt`), no native dependency. What we use in the challenge. |
| **bcrypt** | Old and battle-tested, but not memory-hard and truncates passwords at 72 bytes. Fine in legacy systems. |
| PBKDF2 | Only when a compliance rule (FIPS) requires it; needs very high iteration counts. |
| ~~MD5, SHA-1, SHA-256, SHA-512~~ | General-purpose digests. Never for passwords, salted or not. |

"Memory-hard" means each guess needs a big chunk of RAM (16 MiB with our scrypt settings). GPUs have thousands of cores but not thousands of × 16 MiB of fast memory, so the attacker loses most of their parallelism.

### A self-describing hash format

Store the algorithm and parameters inside the hash string:

```
scrypt$16384$8$1$<salt base64>$<hash base64>
│      │     │ │
│      │     │ └ p (parallelism)
│      │     └ r (block size)
│      └ N (CPU/memory cost, power of two)
└ algorithm
```

When you raise the cost next year, old hashes still verify with their own parameters. On the user's next successful login you re-hash with the new cost. bcrypt (`$2b$12$...`) and argon2 (`$argon2id$v=19$m=65536,t=3,p=4$...`) use the same idea.

```ts
import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

function scryptAsync(pw: string, salt: Buffer, len: number, opts: { N: number; r: number; p: number }) {
  return new Promise<Buffer>((resolve, reject) =>
    scrypt(pw, salt, len, { ...opts, maxmem: 256 * opts.N * opts.r }, (err, key) => (err ? reject(err) : resolve(key))),
  );
}

const salt = randomBytes(16);
const key = await scryptAsync("correct horse battery staple", salt, 64, { N: 16384, r: 8, p: 1 });
// verify later: re-derive with the stored salt + params, then
timingSafeEqual(key, storedKey);
```

### Comparing in constant time

`a === b` on strings stops at the first byte that differs. In theory an attacker measuring response times can learn how many leading bytes matched. For password *hashes* the risk is small (the attacker doesn't control the hash input directly), but for **signatures, API keys and tokens** it's real. Make it a habit: compare secrets with `crypto.timingSafeEqual` (it requires equal-length buffers, so check length first).

### Password rules that actually help

Modern guidance (NIST SP 800-63B) is the opposite of what most sites still do:

- ✅ Minimum length (at least 8; we use 12), allow long passphrases (64+ characters).
- ✅ Check against lists of breached passwords (e.g. the "Have I Been Pwned" k-anonymity API).
- ✅ A maximum length (e.g. 128), so nobody can make you hash a 10 MB string.
- ❌ No forced composition rules ("one symbol, one digit"). They produce `Password1!`.
- ❌ No forced periodic rotation. Rotate only on evidence of compromise.

## 3. Sessions: the classic approach

After login, the browser needs to prove "I'm still that user" on every request without sending the password again. The classic answer is a **server-side session**:

```mermaid
sequenceDiagram
  participant B as Browser
  participant API
  participant R as Redis
  participant DB as Postgres
  B->>API: POST /auth/login {email, password}
  API->>DB: SELECT user by email
  API->>API: verify scrypt hash
  API->>R: SET wl:22:session:<random id> {userId} EX 3600
  API-->>B: 200 + Set-Cookie: sid=<id>; HttpOnly; Secure; SameSite=Lax
  Note over B: the browser stores the cookie and sends it automatically
  B->>API: GET /documents (Cookie: sid=<id>)
  API->>R: GET wl:22:session:<id> (+ refresh TTL)
  API->>DB: SELECT user by id (fresh role)
  API-->>B: 200 [...]
  B->>API: POST /auth/logout
  API->>R: DEL wl:22:session:<id>
  API-->>B: 204 + Set-Cookie: sid=; Max-Age=0
```

The cookie holds **only an opaque, random id**. It means nothing by itself; all the data lives on the server. That's the key property: **to log someone out, you delete one Redis key**, and it takes effect on the very next request.

### The session id must be unguessable

If an attacker can guess a valid id, they're logged in as that user. So:

- ✅ `crypto.randomBytes(32).toString("base64url")`: 256 bits from the OS's secure random generator.
- ❌ `Math.random()`, timestamps, incrementing integers, the user id, `hash(email)`.

### Cookie flags, one by one

```
Set-Cookie: sid=Jq3...; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=604800
```

| Attribute | What it does | Why you want it |
|---|---|---|
| `HttpOnly` | JavaScript can't read the cookie (`document.cookie` doesn't show it) | An XSS bug can't steal the session id |
| `Secure` | Only sent over HTTPS | No leaking over plain HTTP on hotel Wi-Fi |
| `SameSite=Lax` | Not sent on cross-site subrequests and cross-site POSTs; sent on top-level GET navigations | Blocks most CSRF (section 6) |
| `SameSite=Strict` | Never sent cross-site, even when following a link | Stronger, but users arriving from an email link look logged out |
| `Path=/` | Which paths get the cookie | Usually the whole API |
| `Max-Age` / `Expires` | When the browser drops it | Without it, it's a "session cookie" that lives until the browser closes (which modern browsers often never do) |
| `Domain` | Which hosts get it | Leave it **unset** to scope to exactly this host; setting `Domain=example.com` sends it to every subdomain too |

> ⚠️ `Secure` and local development: browsers treat `http://localhost` as secure, but `curl` over plain http won't send a `Secure` cookie back. That's why the challenge makes `Secure` configurable and turns it on by default in production.

### Session lifetime: idle vs absolute

- **Idle timeout** (sliding expiry): every request pushes the expiry forward. In Redis that's `GETEX key EX ttl` or `EXPIRE` on each read. A session nobody uses dies on its own.
- **Absolute timeout**: even an active session ends after, say, 30 days. Store `createdAt` in the session and check it.
- **Re-authentication for sensitive actions**: changing the password or email asks for the current password again, even with a valid session.

### Rotation: the session fixation attack

If your app keeps the **same session id** before and after login, an attacker can:

1. get a valid anonymous session id from your site,
2. trick the victim into using it (a link, a subdomain cookie, a shared computer),
3. wait for the victim to log in, which upgrades *that id* to an authenticated session the attacker also holds.

The fix is simple: **always issue a new session id on login** (and on privilege changes), and destroy any old one the client sent.

### "Log out everywhere"

To revoke all of a user's sessions (after a password change or a suspected compromise), you need to find them. Keep a Redis set per user, `wl:22:user-sessions:<userId>`, with their session ids. Logging out everywhere means deleting every key in that set.

### Load the user on every request

You could store `{userId, role}` in the session and skip the database. But then demoting an admin, or deleting an account, has no effect until their session expires. Loading the user by id is a primary-key lookup that costs well under a millisecond. Cache it if you must ([module 18](../18-caching/README.md)), but make sure invalidation is part of the role-change code path.

## 4. JWTs: tokens that carry their own data

A **JSON Web Token** is a different design: instead of an opaque id pointing to server-side data, the token *is* the data, plus a signature proving the server issued it.

```
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1XzQyIiwicm9sZSI6InVzZXIiLCJleHAiOjE3MzAwMDAwMDB9.4pcPyMD09olPSyXnrXCjTwXyr4BsezdI1AVTmud2fU4
└───────────── header ─────────────┘ └──────────────────────── payload ────────────────────────────┘ └──────────── signature ────────────────┘
```

Each part is base64url-encoded:

```jsonc
// header
{ "alg": "HS256", "typ": "JWT" }
// payload ("claims")
{ "sub": "u_42", "role": "user", "iat": 1729996400, "exp": 1730000000 }
// signature
HMAC_SHA256(base64url(header) + "." + base64url(payload), secret)
```

Important consequences:

- **The payload is not encrypted.** Anyone can base64-decode it. Never put secrets or personal data you wouldn't print on a postcard in a JWT.
- **The signature makes it tamper-evident.** Change `"role":"user"` to `"admin"` and the signature no longer matches, as long as the server actually checks it, *with the right algorithm*.
- **Verification is local.** Any service with the key can verify the token without a database call. That's the appeal.

### Signing algorithms

| `alg` | Type | Who can sign | Who can verify |
|---|---|---|---|
| HS256 | HMAC with a shared secret | anyone with the secret | anyone with the secret |
| RS256 / ES256 / EdDSA | asymmetric signature | only the holder of the private key | anyone with the public key (often published as a JWKS URL) |

Use HMAC when one service both issues and verifies. Use asymmetric keys when many services verify tokens issued by one auth server, so verifiers never hold a key that could mint tokens.

### The `alg` trap

The header says which algorithm was used, and the header is **attacker-controlled**. Two famous bugs come from trusting it:

1. **`alg: none`**: the JWT spec defines an "unsecured" token with an empty signature. A verifier that reads `alg` from the header and honors `none` accepts any payload the attacker writes.
2. **Algorithm confusion**: a server expects RS256 and verifies with its *public* key. The attacker sends `alg: HS256` and signs with the public key (which is public!) as the HMAC secret. A naive library that picks the algorithm from the header happily verifies it.

The rule: **the server decides the algorithm.** Pin it in the verify call (`algorithms: ["HS256"]` in `jsonwebtoken`, or the equivalent in `jose`), and reject anything else. Part B of the challenge has exactly this bug.

### Always validate the claims

A valid signature means "we issued this at some point". You still have to check:

- `exp`: expired tokens must fail. A missing `exp` should fail too, or you've issued a token that's valid forever.
- `nbf` / `iat`: not valid before / issued at (allow a few seconds of clock skew).
- `iss` and `aud`: issued by whom, intended for whom. Stops a token for service A being replayed against service B.

### The revocation problem

Here's the big trade-off. A stateless JWT is valid until `exp`, **and the server has no record of it**. So:

- "Log out" only deletes the token from the client. A copy an attacker grabbed still works.
- Demoting an admin doesn't take effect until their token expires (the role is baked into the token).
- To revoke early you need a **denylist** of token ids (`jti`) checked on every request... which is a server-side lookup on every request. That's a session store with extra steps.

So in practice: keep access tokens **short-lived** (5–15 minutes) and pair them with a refresh token.

### Where to store tokens in a browser

| Storage | XSS can steal it? | Sent automatically (CSRF risk)? |
|---|---|---|
| `localStorage` / `sessionStorage` | **Yes**: any injected script reads it | No |
| JS memory (a variable) | Harder, but XSS can still make requests as the user | No |
| `HttpOnly` cookie | **No** | Yes, so mitigate CSRF (SameSite) |

Putting a long-lived JWT in `localStorage` is the most common setup in tutorials and the one security reviewers flag most. If the client is a browser on your own domain, an `HttpOnly` cookie is the safer default, and at that point a plain session id usually does the job with fewer moving parts.

## 5. Access + refresh tokens

The standard pattern when you do need tokens (mobile apps, third-party clients, many services):

- **Access token**: a JWT, short-lived (5–15 min), sent as `Authorization: Bearer ...` on every API call, verified locally.
- **Refresh token**: an opaque random string, long-lived (days to weeks), **stored server-side** (hashed), sent only to `POST /auth/refresh` to get a new access token.

```mermaid
sequenceDiagram
  participant C as Client
  participant Auth as Auth API
  participant DB as Token store
  C->>Auth: POST /auth/refresh (refresh token R1)
  Auth->>DB: look up hash(R1): valid, unused, family F
  Auth->>DB: mark R1 used, store R2 in family F
  Auth-->>C: new access token A2 + refresh token R2
  Note over C,Auth: Later, an attacker replays the stolen R1
  C->>Auth: POST /auth/refresh (R1 again)
  Auth->>DB: R1 already used → REUSE DETECTED
  Auth->>DB: revoke the whole family F (R2 dies too)
  Auth-->>C: 401, everyone in family F must log in again
```

- **Rotation**: every refresh returns a *new* refresh token and invalidates the old one.
- **Reuse detection**: if an already-used refresh token shows up, either the legitimate client or a thief is replaying it, and you can't tell which. Revoke the whole token family. The real user logs in again; the thief is locked out.

You get cheap stateless checks on most requests, and revocation within one access-token lifetime. The cost is complexity: a refresh endpoint, client retry logic, and a token store. That's why many teams with only a first-party web app stick with sessions.

## 6. CSRF: the cookie's weak spot

Cookies are sent automatically, including on requests *another site* triggers. Cross-Site Request Forgery exploits that:

```html
<!-- on evil.example -->
<form action="https://bank.example/transfer" method="POST">
  <input name="to" value="attacker"><input name="amount" value="1000">
</form>
<script>document.forms[0].submit()</script>
```

If the victim is logged in at `bank.example` and the browser attaches the session cookie, the transfer happens. The attacker never sees the response; they don't need to.

Defenses, layered:

1. **`SameSite=Lax`** (now the default in most browsers for cookies without the attribute): the cookie isn't sent on cross-site POSTs. This alone stops the classic attack.
2. **Don't change state on GET.** `Lax` still sends cookies on top-level GET navigations, so `GET /account/delete` is exploitable with a plain link.
3. **Require a non-simple request for writes.** Only accept `Content-Type: application/json` on state-changing endpoints. Plain HTML forms can't send JSON, and a cross-origin `fetch` with that content type triggers a CORS preflight your server won't approve.
4. **Check `Origin`** on state-changing requests against an allowlist.
5. **CSRF tokens** (synchronizer token or double-submit cookie) when you must support old browsers or cross-site embedding.

Bearer tokens in an `Authorization` header aren't attached automatically, so they aren't vulnerable to CSRF. That's the flip side of the storage table above: you trade CSRF exposure for XSS exposure. Module [25 · Web Security](../25-security/README.md) goes deeper on CSRF, CORS and XSS.

## 7. Authorization models

### RBAC: role-based access control

Users have roles, roles grant permissions. Simple and easy to audit:

```ts
router.use("/admin", requireRole("admin"));
```

Real systems often map roles to **permissions** (`documents:delete`, `users:read`) and check permissions in code, so adding a role doesn't mean hunting through every `requireRole` call.

### ABAC: attribute-based access control

Decisions use attributes of the user, the resource and the context: *"a user may edit a document if they own it, or if they're in the same team and the document isn't locked, during business hours."* More expressive, harder to audit. Most apps end up with RBAC for coarse rules plus a few attribute rules, especially **ownership**.

The challenge's policy combines both:

| action | owner | admin (not owner) | other user |
|---|---|---|---|
| read | ✅ | ✅ | 404 |
| edit | ✅ | **403** | 404 |
| delete | ✅ | ✅ | 404 |

### IDOR: the most common API vulnerability

**Insecure Direct Object Reference** means: the endpoint checks that you're logged in, then returns whatever id you asked for.

```ts
// ❌ authenticated, but not authorized
router.get("/documents/:id", requireAuth, async (req, res) => {
  res.json(await repo.findById(req.params.id));
});
```

Change the id in the URL, read someone else's invoice. UUIDs make ids harder to guess but don't fix the bug: ids leak through URLs, logs, emails and shared links. The fix is an ownership check on every access, in one place:

```ts
// ✅ in the service
private async loadVisible(actor: Actor, id: string) {
  const doc = await this.documents.findById(id);
  if (!doc || (doc.ownerId !== actor.id && actor.role !== "admin")) throw new NotFoundError("Document");
  return doc;
}
```

**404 or 403?** Returning 403 for someone else's document confirms it exists, which lets an attacker enumerate ids. Returning 404 makes "not yours" look like "doesn't exist". Use 403 when the caller is entitled to know the resource exists (like the admin above).

Two related habits:

- **Take identity from the session, never from the request.** `ownerId` comes from `res.locals.user`, not `req.body.ownerId`. Accepting it from the body is *mass assignment* (module 25).
- **Filter list queries too.** `GET /documents` must use `WHERE owner_id = $1`. It's easy to protect `/:id` and forget the list.

## 8. Login hardening

### User enumeration

```
POST /login {email: "ceo@corp.com", password: "x"}  → 404 "No account found"
POST /login {email: "nobody@corp.com", password: "x"} → 404 "No account found"
POST /login {email: "ceo@corp.com", ...}            → 401 "Wrong password"   ← confirms the account exists
```

Different messages or status codes let an attacker build a list of valid accounts for phishing and password-spraying. Always answer `401 Invalid email or password`.

### Timing attacks on login

Same message, but different speed: for an unknown email the server returns instantly; for a known one it spends ~50 ms hashing. An attacker measures response times and can tell them apart. The fix: **when the user doesn't exist, still verify the password against a dummy hash**, so both paths do the same work.

```ts
if (!user) {
  await hasher.verify(password, DUMMY_HASH); // result ignored on purpose
  throw new InvalidCredentialsError();
}
```

Registration and "forgot password" leak too. "This email is already registered" on sign-up is an enumeration oracle. Products usually accept that for sign-up, or switch to "we've sent you an email" flows for both cases. Forgot-password should always say "if an account exists, we've sent a link".

### Rate limiting login

A slow hash makes offline cracking expensive. Online guessing (hammering `/login`) needs **rate limits**:

- per IP (catch one noisy attacker),
- per account (catch a distributed attack on one user; prefer slowing down or adding a CAPTCHA over hard lockouts, which let attackers lock out victims on purpose),
- globally on failed logins (catch credential-stuffing waves).

You'll build Redis-backed limiters in [module 19](../19-rate-limiting/README.md). Put one in front of `/auth/login` in real life.

## 9. OAuth2 and OpenID Connect, briefly

You'll meet these at every company, so know what they're for:

- **OAuth2** is an *authorization delegation* framework: "let app X access my data at service Y, with limited scope, without giving X my password". It produces **access tokens**. The flow you'll use most is **Authorization Code + PKCE**: the user is redirected to the provider, logs in there, and your app exchanges a one-time code for tokens.
- **OpenID Connect (OIDC)** is a layer on top of OAuth2 for *authentication*: "Log in with Google/GitHub/Okta". It adds an **ID token** (a JWT describing the user) and a standard `userinfo` endpoint.

```mermaid
sequenceDiagram
  participant U as User's browser
  participant App as Your backend
  participant IdP as Identity provider (Google, Okta...)
  U->>App: GET /login
  App-->>U: 302 to IdP /authorize?client_id&redirect_uri&scope=openid email&code_challenge&state
  U->>IdP: log in + consent
  IdP-->>U: 302 to App /callback?code=...&state=...
  U->>App: GET /callback?code&state
  App->>IdP: POST /token (code + code_verifier + client secret)
  IdP-->>App: id_token (JWT) + access_token
  App->>App: verify id_token (signature via JWKS, iss, aud, exp, nonce)
  App-->>U: Set-Cookie: sid=... (your own session!)
```

Note the last step: a typical web backend uses OIDC to *learn who the user is*, then creates **its own session** exactly like the one you build in this module. Use a well-maintained library (`openid-client`) or a hosted provider; don't implement the flows by hand.

## Common mistakes

- Hashing passwords with SHA-256/MD5, with or without a salt.
- Using one global salt (a "pepper" is a separate, optional idea and doesn't replace per-user salts).
- Comparing hashes, signatures or API keys with `===` instead of `timingSafeEqual`.
- Session ids from `Math.random()` or `Date.now()`.
- Keeping the same session id across login (session fixation).
- Forgetting `HttpOnly`, or setting `Domain=` so the cookie goes to every subdomain.
- Verifying JWTs with the algorithm from the token header; accepting `alg: none`.
- Not checking `exp`, or issuing tokens without one.
- Long-lived JWTs in `localStorage`.
- Putting the role in the token/session and never re-checking it.
- Checking authentication but not ownership (IDOR), especially on list endpoints.
- Different errors for "no such user" and "wrong password".
- Returning the full user row (with `password_hash`) from an endpoint. Map to a public DTO with an **allowlist** of fields.
- Logging request bodies on `/login`, or session ids and tokens anywhere.

## In production

- **Don't roll your own crypto primitives.** Use `crypto.scrypt`, `argon2`, `jose`/`jsonwebtoken` and `openid-client`. Writing the glue code (as you do in this module) is normal; writing your own HMAC or hash is not. Part B's hand-written JWT verifier shows how easily a small home-grown version goes wrong.
- **Many companies outsource identity** to Auth0, Okta, Cognito, Keycloak, or Google/Microsoft accounts via OIDC. Your backend still owns sessions, authorization and ownership checks, and those are where most bugs live.
- **MFA** (TOTP apps, WebAuthn/passkeys) is expected for admin accounts and increasingly for everyone. Passkeys remove passwords entirely, so there's nothing to phish or reuse.
- **Service-to-service auth** uses different tools: mTLS inside a service mesh, signed JWTs with short lifetimes, or cloud IAM identities. User sessions don't cross service boundaries; the edge service translates them into a token the internal services trust.
- **Audit logs** for logins, failed logins, role changes and admin actions are a compliance requirement (SOC 2, ISO 27001) at most companies.
- **Secret rotation**: JWT signing keys need a key id (`kid` header) so you can publish a new key, sign with it, and keep verifying old tokens until they expire.

## Check yourself

1. Why is a per-user salt not enough to make SHA-256 acceptable for passwords?
   <details><summary>Answer</summary>Salts stop precomputed tables and identical-hash reuse, but SHA-256 is still fast: an attacker can try billions of guesses per second against each salted hash. You need a deliberately slow, memory-hard function (scrypt, argon2id, bcrypt).</details>
2. What does `HttpOnly` protect against, and what does it not protect against?
   <details><summary>Answer</summary>It stops JavaScript (and so XSS) from <em>reading</em> the cookie and exfiltrating the session id. It doesn't stop XSS from making requests from the victim's browser while they're on the page, and it does nothing against CSRF.</details>
3. Your JWT-based API needs "log out of all devices" to work instantly. What are your options?
   <details><summary>Answer</summary>Stateless JWTs can't be revoked early. Options: a denylist / per-user "tokens issued before X are invalid" timestamp checked on every request (server-side state), very short access tokens plus revocable refresh tokens, or switching to server-side sessions.</details>
4. Bob requests `GET /documents/<alice's id>`. Why return 404 instead of 403?
   <details><summary>Answer</summary>403 confirms the document exists, letting an attacker probe which ids are valid. 404 makes "not yours" indistinguishable from "missing".</details>
5. Why should a server never use the `alg` from the JWT header to choose how to verify?
   <details><summary>Answer</summary>The header is attacker-controlled. Trusting it enables <code>alg: none</code> (no signature) and algorithm-confusion attacks (HS256 signed with an RSA public key). The server must pin the expected algorithm.</details>

## Further reading

- OWASP Password Storage Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html
- OWASP Session Management Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html
- OWASP Authorization Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html
- RFC 7519, JSON Web Token: https://www.rfc-editor.org/rfc/rfc7519
- RFC 8725, JWT Best Current Practices: https://www.rfc-editor.org/rfc/rfc8725
- NIST SP 800-63B, Digital Identity Guidelines: https://pages.nist.gov/800-63-3/sp800-63b.html
- MDN, Set-Cookie: https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Set-Cookie
- Node.js crypto docs (scrypt, timingSafeEqual): https://nodejs.org/api/crypto.html
- Deep dives in this module: [docs/sessions-vs-jwt.md](docs/sessions-vs-jwt.md) · [docs/authorization-patterns.md](docs/authorization-patterns.md) · [docs/auth-cheatsheet.md](docs/auth-cheatsheet.md)

## ➡️ Next: [the challenge](CHALLENGE.md)
