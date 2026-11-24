# web/ (M7)

Your React frontend goes here. It is **not** part of `npm test` in `challenge/`;
give it its own `package.json` (Vite + React + TypeScript, like modules R1/R2).

Minimum to call M7 done (see CHALLENGE.md for the full list):

- log in, list upcoming events
- a seat map that updates live from `GET /events/:id/seats/stream` (EventSource)
- pick seats -> hold -> countdown -> book, with an Idempotency-Key created **once per hold**
- loading, error and empty states; API calls live in one client module, not in components

Tip: proxy `/api` to `http://localhost:3000` in `vite.config.ts` so the browser
sees a single origin and you don't need CORS in development.
