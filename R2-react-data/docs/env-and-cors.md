# Deep dive · Config, CORS and running against your API

How to point this frontend at a real backend (module 23's API or your own), and what the backend has to do to allow it.

## Vite environment variables

Vite loads these files from the project root (later ones win):

```
.env                # all modes, committed (non-secret defaults)
.env.local          # all modes, gitignored (your machine)
.env.[mode]         # e.g. .env.production
.env.[mode].local   # gitignored
```

`npm run dev` runs in mode `development`; `vite build` in `production`. Only variables starting with `VITE_` reach `import.meta.env` in browser code. Built-ins: `import.meta.env.MODE`, `DEV`, `PROD`, `BASE_URL`.

Types: `"types": ["vite/client"]` in `tsconfig.json` gives you `import.meta.env`. To type your own variables:

```ts
// src/vite-env.d.ts
interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  readonly VITE_PROJECT_ID?: string;
}
```

This module validates them with zod in `src/lib/config.ts` instead, which also catches *invalid* values (a malformed URL) at startup instead of at the first request.

### Build-time inlining

`import.meta.env.VITE_API_URL` is replaced with a string literal during the build. Consequences:

- It's public. Treat every `VITE_` value as something an attacker can read.
- Changing it requires a rebuild. For "build once, deploy everywhere", serve a `/config.json` from your web server and fetch it before rendering, or have the server inject `window.__CONFIG__` into `index.html`.

## CORS on the Express side

Here's a minimal, explicit CORS middleware for module 23's API. (In real projects the `cors` npm package does the same with options. Writing it once shows what the headers mean.)

```ts
import type { RequestHandler } from "express";

export function cors(allowedOrigins: string[]): RequestHandler {
  const allowed = new Set(allowedOrigins);
  return (req, res, next) => {
    const origin = req.get("origin");
    if (origin && allowed.has(origin)) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin"); // caches must not reuse this response for other origins
      res.setHeader("Access-Control-Expose-Headers", "ETag, Location, X-Request-Id");
    }
    if (req.method === "OPTIONS" && req.get("access-control-request-method")) {
      // Preflight: answer it here, don't run the route.
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type, If-Match, If-None-Match, Idempotency-Key");
      res.setHeader("Access-Control-Max-Age", "600"); // browsers may cache the preflight for 10 min
      res.status(204).end();
      return;
    }
    next();
  };
}

// app.ts: early, before routes and before auth (preflights carry no credentials)
app.use(cors(config.corsOrigins)); // e.g. ["http://localhost:5173", "https://app.example.com"]
```

Things that bite people:

| Symptom | Cause |
|---|---|
| Preflight fails with 401 | auth middleware runs before CORS; preflights never carry `Authorization` |
| Preflight 404 | no handler for `OPTIONS` |
| "Request header field if-match is not allowed" | header missing from `Access-Control-Allow-Headers` |
| `response.headers.get("ETag")` is `null` in JS, but DevTools shows it | not listed in `Access-Control-Expose-Headers` |
| Works without cookies, fails with `credentials: "include"` | `Allow-Origin: *` is not allowed with credentials; also need `Access-Control-Allow-Credentials: true` |
| Random CORS failures behind a CDN | missing `Vary: Origin`, so a cached response for origin A is served to origin B |

Config: put the allowlist in the backend's `config.ts` (`CORS_ORIGINS=http://localhost:5173,https://app.example.com`), never hard-coded, and never reflect *any* incoming `Origin` back blindly: that's equivalent to `*` and, with credentials, a real vulnerability.

### Same origin avoids CORS entirely

If the frontend and API are served from the same origin (`https://app.example.com` and `https://app.example.com/api`), there's no CORS at all: no preflights (faster), no headers to get wrong, and cookies just work. Many production setups do exactly this with a reverse proxy (nginx, Caddy, an ingress) routing `/api` to the backend and everything else to the static frontend.

## The Vite dev proxy

You can get the same-origin setup in development:

```ts
// vite.config.ts
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/v1": { target: "http://localhost:3000", changeOrigin: true },
    },
  },
});
```

Then set `VITE_API_URL=http://localhost:5173` (or make the client accept a relative base URL), and the browser only ever talks to `localhost:5173`. Vite forwards `/v1/*` to the API server-to-server, where CORS doesn't apply.

Use the proxy for convenience, but test real CORS at least once before production. A proxy in dev and a cross-origin setup in prod is a classic "works on my machine".

## Running this challenge against a real API

1. Start an API that implements the contract (module 23's solution, plus the CORS middleware above with `http://localhost:5173` allowed).
2. Create a project and note its id.
3. In `challenge/`: `cp .env.example .env.local`, set `VITE_API_URL` and `VITE_PROJECT_ID`.
4. `make dev` and open http://localhost:5173. Watch the Network tab: preflights, `Idempotency-Key`, `If-Match`, cursors.
5. Open two tabs, change a task's status in one, then in the other: you should get the 412 conflict message.
