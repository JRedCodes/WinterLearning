# Deep dive: input-handling pitfalls in Node

A tour of the ways untrusted input surprises Node developers, beyond the headline vulnerabilities.

## Types are not what you think

`req.query.search` is not a string. It's `string | string[] | ParsedQs | undefined`:

```
?search=a            → "a"
?search=a&search=b   → ["a", "b"]
?search[x]=1         → { x: "1" }      (with the extended query parser)
```

Code like `term.toLowerCase()` crashes on an array (a DoS if it's unhandled), and `{ $ne: null }`-style objects are how NoSQL injection works. Express 5 defaults to the *simple* query parser (no nested objects), which removes a class of problems, but arrays remain. **Always validate types**, ideally with a schema (zod).

The same goes for JSON bodies: `{"email": ["a@b.c"]}` or `{"age": "1e400"}` will reach your code unless you check.

## Unicode and normalization

- `"ﬁle.txt"` vs `"file.txt"`, full-width characters, and right-to-left override characters (`U+202E`) make names look like something they aren't ("invoice‮fdp.exe" displays as "invoiceexe.pdf").
- Case-insensitive comparisons are locale-sensitive: `"I".toLowerCase()` differs in Turkish locales. Use `toLowerCase()` (not `toLocaleLowerCase()`) for identifiers, and consider NFC normalization (`str.normalize("NFC")`) before storing and comparing usernames.
- Email uniqueness: store a normalized form (lowercased) with a unique index, as in [module 12](../../12-data-modeling/README.md).

## Paths

- `path.join(base, input)` resolves `..`; `path.resolve(base, input)` *also* accepts an absolute `input`, which ignores `base` entirely.
- Check containment **after** resolving: `resolved.startsWith(base + path.sep)`. Without the separator, `/data/user1` "contains" `/data/user10`.
- Symlinks: a symlink inside the folder can point outside. If users can create symlinks (archive extraction!), use `fs.realpath` before the check, or refuse symlinks.
- Null bytes: modern Node throws on `\0` in paths, but check anyway when passing names to other systems.

## Numbers

- `Number("")` is `0`, `Number(" 12 ")` is `12`, `Number("1e3")` is `1000`, `parseInt("12abc")` is `12`. Validate with a regex or `z.coerce.number().int()` with bounds.
- JavaScript numbers lose precision above 2^53. Postgres `bigint` comes back from `pg` as a string for that reason.
- Negative quantities, zero prices, `NaN` and `Infinity` all sneak past `typeof x === "number"`.

## Size and depth

- `express.json({ limit })` caps the body, but a 100 KB body can still be 50,000 levels of nested arrays, which crashes naive recursive code. Schemas with bounded depth, or a depth check, help.
- Arrays: `z.array(item).max(100)`. An unbounded array of IDs becomes an unbounded `IN (...)` query.
- Strings: cap everything (`max(1000)`); a 1 MB "display name" ends up in every page and log line.

## HTTP header gotchas

- `X-Forwarded-For` is **client-controlled** unless a proxy you trust overwrites it. Configure `app.set("trust proxy", <your proxy hops>)` and use `req.ip`; never trust the raw header for rate limiting or IP allowlists.
- `Host` is client-controlled. Don't build password-reset links from `req.get("host")`, or attackers get reset links pointing at their domain ("host header injection"). Use a configured base URL.
- `Content-Type` decides how bodies are parsed; a form post with `text/plain` skips CORS preflight (relevant for CSRF).

## Regexes

- Anchor them: `/^[a-z]+$/`, not `/[a-z]+/` (which matches `"<script>a"`).
- Watch out for `.` not matching newlines and `$` matching before a trailing newline in some engines and flags.
- See the lesson on ReDoS: no nested quantifiers on untrusted input, cap length first.

## Output contexts

The same string needs different escaping in different places: an HTML body, an HTML attribute, a URL query param (`encodeURIComponent`), a JavaScript string, a CSV cell (cells starting with `=`, `+`, `-`, `@` become formulas in Excel: "CSV injection"), a shell argument (use `execFile`). Escape at the point of output, for that context, not once at input.
