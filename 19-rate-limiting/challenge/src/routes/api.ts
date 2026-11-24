import { Router } from "express";

const QUOTES = [
  "Make it work, make it right, make it fast.",
  "Premature optimization is the root of all evil.",
  "There are only two hard things: cache invalidation and naming things.",
  "Simple things should be simple, complex things should be possible.",
];

/**
 * The "product" endpoints. Notice there is no rate-limiting code in here:
 * limiting is a cross-cutting concern applied in app.ts, in front of the router.
 */
export function apiRouter() {
  const router = Router();

  router.get("/quotes", (_req, res) => {
    res.json({ data: QUOTES });
  });

  router.get("/quotes/random", (_req, res) => {
    const quote = QUOTES[Math.floor(Math.random() * QUOTES.length)];
    res.json({ data: quote });
  });

  return router;
}
