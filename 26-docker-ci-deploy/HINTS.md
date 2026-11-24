# Hints · Docker, CI & Deployment

Open one hint at a time. Give each a real try before opening the next.

## TODO 1: Dockerfile

<details><summary>Hint 1</summary>

Start from the two-stage example in the lesson (section 3). Then check the test file: each `it(...)` names one rule, and the assertion messages say what they're looking for.
</details>

<details><summary>Hint 2</summary>

Order inside the build stage: `WORKDIR` → `COPY package.json package-lock.json ./` → `RUN npm ci` → `COPY tsconfig.json tsconfig.build.json ./` → `COPY src ./src` → `RUN npm run build`. In the final stage, don't forget `package.json`: Node needs `"type": "module"` from it to run ESM.
</details>

<details><summary>Hint 3</summary>

Final stage skeleton: `FROM node:22-alpine AS runtime` / `ENV NODE_ENV=production` / `WORKDIR /app` / prod `node_modules` (via `npm ci --omit=dev` or `COPY --from=deps`) / `COPY --from=build /app/dist ./dist` / `COPY package.json ./` / `COPY migrations ./migrations` / `USER node` / `EXPOSE 3000` / `HEALTHCHECK --interval=10s CMD ["node", "dist/healthcheck.js"]` / `CMD ["node", "dist/server.js"]`.
</details>

## TODO 2: .dockerignore

<details><summary>Hint 1</summary>

Ask: what on my disk should never be inside an image? Then: what does the build actually `COPY`?
</details>

<details><summary>Hint 2</summary>

One pattern per line: `node_modules`, `dist`, `.git`, `.env`, `.env.*`, plus nice-to-haves like `coverage` and `*.log`. `!.env.example` re-includes a file.
</details>

## TODO 3: compose

<details><summary>Hint 1</summary>

Both new services are built from the same Dockerfile (`build: .`). They only differ in their command and what they wait for.
</details>

<details><summary>Hint 2</summary>

Long-form `depends_on`:
```yaml
depends_on:
  postgres:
    condition: service_healthy
```
The api depends on two services with different conditions.
</details>

<details><summary>Hint 3</summary>

`stop_grace_period: 15s` with `SHUTDOWN_TIMEOUT_MS: "10000"` in the api's environment. The migrate service gets `restart: "no"` (quoted, because a bare `no` is a boolean in some YAML parsers).
</details>

## TODO 4: workflow

<details><summary>Hint 1</summary>

The lesson's section 7 and `docs/ci-docker-cheatsheet.md` have skeletons. This repo's root `.github/workflows/ci.yml` is a working real-world example of service containers.
</details>

<details><summary>Hint 2</summary>

The service container's port mapping (`"5433:5432"`) makes the default `DATABASE_URL` in `src/config.ts` and the tests work unchanged. `options: >-` with `--health-cmd "pg_isready -U postgres"` makes the job wait for it.
</details>

<details><summary>Hint 3</summary>

Second job:
```yaml
docker:
  needs: test
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
    - run: docker build -t parcels:${{ github.sha }} .
```
</details>

## TODO 5: createServerLifecycle

<details><summary>Hint 1</summary>

Use `http.createServer()` with **no** handler, then add your own `"request"` listener first and the app's handler second (`server.on("request", handler)`). That way you see every request before the app does.
</details>

<details><summary>Hint 2</summary>

Track `Map<Socket, number>` (requests in flight per socket) via the `"connection"` event and `res.once("finish")`. Track unfinished responses in a `Set<ServerResponse>`. On shutdown: `server.close(cb)`, `socket.end()` the sockets with 0 in flight, `setHeader("Connection", "close")` on responses that haven't sent headers, and after each later response finishes, `end()` its socket if nothing else is in flight. See `docs/graceful-shutdown.md`.
</details>

<details><summary>Hint 3</summary>

```ts
shutdown(reason) {
  if (!promise) { state = "draining"; promise = doShutdown(reason); }
  return promise;
}
async function doShutdown() {
  let forced = false;
  await new Promise<void>((resolve) => {
    const timer = setTimeout(() => { forced = true; destroy every tracked socket }, drainTimeoutMs);
    server.close(() => { clearTimeout(timer); resolve(); });
    end idle sockets; mark active responses Connection: close
  });
  for (const hook of hooks) try { await hook.close() } catch (e) { record }
  state = "stopped"; return report;
}
```
</details>

## TODO 6: installSignalHandlers

<details><summary>Hint 1</summary>

You need one boolean that remembers whether a signal already arrived.
</details>

<details><summary>Hint 2</summary>

`target.on("SIGTERM", () => onSignal("SIGTERM"))` and the same for SIGINT. In `onSignal`, use `.then(onOk, onError)` on the shutdown promise and call `target.exit(...)` in both branches.
</details>
