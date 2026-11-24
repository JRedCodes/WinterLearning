# Cheat sheet · Web security for Node/Express

## Injection

```ts
pool.query("SELECT * FROM t WHERE a = $1 AND b ILIKE $2", [a, `%${term}%`]);   // ✅
pool.query(`SELECT * FROM t WHERE a = '${a}'`);                                 // ❌
const col = ({ name: "name", date: "created_at" } as const)[sortParam] ?? "name"; // identifiers: allowlist
execFile("convert", [input, "out.png"]);                                        // ✅ not exec(`convert ${input}`)
```

## Paths

```ts
const base = path.resolve(root, String(userId));
const full = path.resolve(base, name);
if (path.dirname(full) !== base) throw new ValidationError("bad name");  // flat folder
// nested: if (!full.startsWith(base + path.sep)) …
```
Better: look the file up in the DB by (owner, name/id) first.

## SSRF guard

1. `new URL(input)`; `http:`/`https:` only; expected ports; no credentials
2. `dns.lookup(host, { all: true })`; reject if **any** address is in a blocked range (`net.BlockList`)
3. `fetch(url, { redirect: "manual", signal: AbortSignal.timeout(5000) })`
4. non-2xx → error; cap size; egress proxy for the rebinding gap

Blocked: `0/8 10/8 100.64/10 127/8 169.254/16 172.16/12 192.168/16 224/4 240/4 :: ::1 fc00::/7 fe80::/10 ff00::/8`, plus IPv4-mapped IPv6.

## Mass assignment

```ts
const UpdateMe = z.object({ displayName: z.string().max(100).optional(), email: z.email().optional() }).strict();
```
Fixed column lists in repositories. Privileged changes get separate endpoints.

## Prototype pollution

Skip `__proto__`, `constructor`, `prototype` in merges; recurse only into own plain objects; `Object.create(null)` / `Map` for user-keyed dictionaries; `node --disable-proto=delete`.

## ReDoS

No `(x+)+`, `(x|x)*`, `(\w+\s?)*`. Cap length before matching. Bounded quantifiers. RE2 for user-supplied patterns.

## Headers & CORS

```ts
app.disable("x-powered-by");
app.use(helmet());                              // CSP, HSTS, nosniff, frame protection, referrer policy …
const allowed = new Set(config.corsOrigins);    // exact origins, never reflect blindly
res.vary("Origin");
if (origin && allowed.has(origin)) { ACAO = origin; ACAC = "true"; }
```
Never `*` with credentials. Never allow `null`. No `endsWith` checks.

## Cookies (from module 22)

`HttpOnly; Secure; SameSite=Lax` (or `Strict`); rotate the session id on login.

## Limits

`express.json({ limit: "100kb" })` · `z.string().max()` · `z.array().max()` · pagination caps · `statement_timeout` · outbound timeouts · rate limits.

## Secrets & deps

`.env` in `.gitignore` · `.env.example` with fakes · secret manager in prod · rotate on leak · `npm ci` + committed lockfile · `npm audit` / Dependabot · few dependencies.

## Least privilege (Postgres)

```sql
CREATE ROLE app_rw LOGIN PASSWORD '…';
GRANT USAGE ON SCHEMA public TO app_rw;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_rw;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO app_rw;
-- migrations run as a separate owner role
```

## OWASP Top 10 (2021) one-liners

A01 access control · A02 crypto failures · A03 injection · A04 insecure design · A05 misconfiguration · A06 vulnerable components · A07 authn failures · A08 integrity failures (deserialization, supply chain) · A09 logging/monitoring failures · A10 SSRF
