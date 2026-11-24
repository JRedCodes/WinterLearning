# Hints · Dev Environment & Workflow

Open one hint at a time. Give each a real try before opening the next.

## TODO 1: docker-compose.yml

<details><summary>Hint 1</summary>

The file has three top-level keys: `name`, `services` and `volumes`. Each service needs `image`, `ports` and `healthcheck`; Postgres also needs `environment` and `volumes`.
</details>

<details><summary>Hint 2</summary>

Ports are `"HOST:CONTAINER"` strings in a list. Quote them: unquoted `56:22`-style values can be parsed as base-60 numbers by some YAML parsers. A named volume is used as `name:/path` in the service and declared as `name:` (empty value) under the top-level `volumes:`.
</details>

<details><summary>Hint 3</summary>

Shape of one service:

```yaml
  redis:
    image: ...
    ports:
      - "....:...."
    healthcheck:
      test: ["CMD", "...", "..."]
      interval: 2s
      timeout: 3s
      retries: 20
```

For Postgres, `test: ["CMD-SHELL", "pg_isready -U postgres"]`. Check the result with `docker compose config`.
</details>

## TODO 2: Makefile

<details><summary>Hint 1</summary>

Every target is just a name, a colon, and TAB-indented shell commands. Look at the existing `install:` target and copy its shape.
</details>

<details><summary>Hint 2</summary>

The commands you need are all in the lesson's Compose table: `up -d --wait`, `down`, `down -v`, `logs -f`, `exec <service> <command>`. `reset` has three lines.
</details>

<details><summary>Hint 3</summary>

```make
.PHONY: install up down test reset dev logs psql redis-cli

psql:
	docker compose exec postgres psql -U postgres -d wl_00
```

If `make` says `missing separator`, your editor inserted spaces. In VS Code: bottom-right "Spaces: 2" → "Indent Using Tabs".
</details>

## TODO 3: .gitignore and .nvmrc

<details><summary>Hint 1</summary>

One pattern per line. A trailing `/` means "directories only". A leading `!` re-includes something an earlier pattern excluded.
</details>

<details><summary>Hint 2</summary>

`.env.*` would also catch `.env.example`. Follow it with `!.env.example`. Order matters: later lines win.
</details>

<details><summary>Hint 3</summary>

You need at least `node_modules/`, `dist/`, `.env`, `.env.*`, `!.env.example`, `*.log`, `.DS_Store`. `.nvmrc` is a one-line file containing `22`.
</details>

## TODO 4: loadConfig

<details><summary>Hint 1</summary>

`env.X || default` treats both `undefined` and `""` as unset. `??` would keep `""`.
</details>

<details><summary>Hint 2</summary>

`Number("1.5")` is `1.5`, `Number("1e3")` is `1000`, `parseInt("10ms")` is `10`. Check the string shape with a regex like `/^\d+$/` before converting, then check `> 0`.
</details>

## TODO 5 & 6: the checks

<details><summary>Hint 1</summary>

The two checks have the same skeleton: start a timer, try (connect, probe), catch (record the message), finally (close). Consider writing one private helper that both use.
</details>

<details><summary>Hint 2</summary>

For the timeout, race the work against a promise that rejects after `timeoutMs`: `Promise.race([work, timeoutPromise])`. Clear the timer in `finally`, or a successful check leaves a pending timer behind. `performance.now()` gives sub-millisecond time; `Math.round` it.
</details>

<details><summary>Hint 3</summary>

```ts
const started = performance.now();
try {
  detail = await withTimeout(probe(), timeoutMs); ok = true;
} catch (err) {
  detail = err instanceof Error ? err.message : String(err);
} finally {
  try { await close(); } catch { /* ignore */ }
}
return { service, ok, latencyMs: Math.round(performance.now() - started), detail };
```

Postgres detail: `String(rows[0]?.version).split(" ").slice(0, 2).join(" ")`.
</details>

## TODO 7: real clients

<details><summary>Hint 1</summary>

Change the imports to value imports: `import pg from "pg"` and `import { Redis } from "ioredis"`. Delete the `_DriverTypes` helper.
</details>

<details><summary>Hint 2</summary>

`new pg.Client({ connectionString, connectionTimeoutMillis })`. For ioredis, all the options you need are listed in the TODO comment; pass them as the second constructor argument.
</details>

<details><summary>Hint 3</summary>

ioredis emits `"error"` events on connection failures. Attach a no-op listener (`redis.on("error", () => {})`) so it doesn't print "Unhandled error event"; the rejection from `connect()` still reaches your check.
</details>

## TODO 8 & 9: wiring and report

<details><summary>Hint 1</summary>

"In parallel" means: create both promises first, then await them together.
</details>

<details><summary>Hint 2</summary>

`Promise.all([checkPostgres(...), checkRedis(...)])` already returns results in the order you passed them. Your checks never reject, so `Promise.all` won't short-circuit.
</details>

<details><summary>Hint 3</summary>

`formatReport`: `results.map(r => \`${r.ok ? "[ OK ]" : "[FAIL]"} ${r.service} ${r.latencyMs}ms ${r.detail}\`).join("\n")`. `padEnd`/`padStart` make it line up nicely. `exitCodeFor`: `results.every(r => r.ok) ? 0 : 1`.
</details>
