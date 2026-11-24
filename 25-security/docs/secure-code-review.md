# Deep dive: a security checklist for code review

Use this when reviewing a PR (yours or a teammate's). For each new or changed endpoint, ask these questions. Most real vulnerabilities would be caught by one of them.

## 1. Who can call this, and on whose data?

- [ ] Is authentication required? Is it applied by default (router-level), or does each route have to remember it?
- [ ] **Ownership:** does every query that takes an id also filter by the current user/tenant (`WHERE id = $1 AND owner_id = $2`)? Missing this is IDOR, the most common real-world API vulnerability.
- [ ] Are role checks on the server, not just hidden buttons in the UI?
- [ ] Do list endpoints leak data from other tenants through filters, search or counts?

## 2. What comes in?

- [ ] Is every input validated against a schema: type, length, range, format? Query, params, body *and* headers that are used.
- [ ] Is it an **allowlist** of fields (no `...req.body` into a create/update)?
- [ ] Are array/string sizes and nesting bounded?
- [ ] Any regexes on user input? Nested quantifiers? Is the length capped first?

## 3. Where does it go?

For every place input reaches a sink:

| Sink | Check |
|---|---|
| SQL | parameters only; identifiers via allowlist; no SQL from object keys |
| Filesystem | no user input in paths, or resolve + containment check |
| Outbound HTTP | SSRF guard (scheme, DNS-resolved IP check, no redirects, timeouts) |
| Shell | `execFile` with an args array, never `exec` with interpolation |
| HTML / email templates | auto-escaping template engine; no `innerHTML` |
| Object merge / set-by-path | prototype pollution guards |
| Logs | no secrets, structured fields, no raw user input as the message |
| Redirects (`res.redirect(req.query.next)`) | allowlist or relative paths only ("open redirect") |

## 4. What goes out?

- [ ] Responses map entities to DTOs: no `passwordHash`, internal flags or other users' emails in the JSON.
- [ ] Errors are generic for 5xx; no stack traces, SQL or paths.
- [ ] Downloads use `Content-Disposition: attachment` and a safe `Content-Type`.
- [ ] Security headers are set globally (helmet) and CORS uses an exact allowlist.

## 5. Abuse and cost

- [ ] What's the most expensive thing one request can trigger (DB scans, hashing, image processing, outbound calls)? Is it rate-limited?
- [ ] Pagination capped? Query timeouts set?
- [ ] Can this endpoint be used to enumerate things (users, files) by observing different responses or timings?

## 6. Secrets and dependencies

- [ ] No secrets in code, tests, fixtures or logs. New config comes from env, documented in `.env.example` with fake values.
- [ ] New dependency? Is it maintained, widely used, and necessary? Does it run install scripts? Is the lockfile updated in the same PR?

## 7. Failure and detection

- [ ] Does it fail closed? (An exception in an auth check must deny, not allow.)
- [ ] Are security-relevant events logged (denials, blocked inputs) without logging the sensitive values themselves?
- [ ] Are there tests for the *abuse* cases, not just the happy path? The challenge's test suite is a model: every finding has an exploit test that must be blocked *and* a functionality test that must keep working.

## Threat modeling in five minutes

Before building a feature, sketch it on a whiteboard and walk through **STRIDE** for each box and arrow:

| Letter | Threat | Example question |
|---|---|---|
| S | Spoofing | Can someone pretend to be another user or service? |
| T | Tampering | Can someone modify data in transit or at rest that they shouldn't? |
| R | Repudiation | Could a user deny an action because we have no audit trail? |
| I | Information disclosure | Can someone read data they shouldn't (IDOR, verbose errors, logs)? |
| D | Denial of service | Can one request or one user exhaust a resource? |
| E | Elevation of privilege | Can a user gain rights they shouldn't (mass assignment, missing role check)? |

Write the answers down next to the design doc. It takes minutes and catches the "fetch any URL" class of design flaws before a line of code exists.
