import express from "express";
import type { RateLimiter } from "./limiter/types.js";
import { rateLimit, type LimiterErrorHook } from "./middleware/rateLimit.js";
import { apiKeyOrIp, loginKey } from "./middleware/keys.js";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";
import { apiRouter } from "./routes/api.js";
import { authRouter } from "./routes/auth.js";

export interface AppDeps {
  /** Guards /api/* (per API key, or per IP for anonymous callers). */
  apiLimiter: RateLimiter;
  /** Guards POST /auth/login (per IP + username). */
  loginLimiter: RateLimiter;
  /** How many proxies sit in front of us; decides what req.ip means. */
  trustProxyHops?: number;
  /** Called when a limiter throws (e.g. Redis is down). Default: console.warn. */
  onLimiterError?: LimiterErrorHook;
}

/**
 * Builds the app. No listen(), no process.env, no Redis connection: limiters
 * are injected, so tests can pass real Redis-backed ones or fakes.
 *
 * Where the limits go is a policy decision, and it's all visible here:
 * - /health is NOT limited (load balancers poll it constantly).
 * - /api/* is limited but FAILS OPEN: if Redis dies we'd rather serve
 *   quotes unlimited for a few minutes than take the product down.
 * - /auth/login FAILS CLOSED: unlimited password guessing is worse than a
 *   temporarily unavailable login.
 */
export function createApp(deps: AppDeps) {
  const app = express();
  app.disable("x-powered-by");
  // With 0 hops req.ip is the socket address; behind N proxies Express reads
  // the client address from X-Forwarded-For (never trust that header blindly).
  app.set("trust proxy", deps.trustProxyHops ?? 0);
  app.use(express.json({ limit: "10kb" }));

  const hook = deps.onLimiterError ? { onLimiterError: deps.onLimiterError } : {};

  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.use("/api", rateLimit(deps.apiLimiter, apiKeyOrIp, { failOpen: true, ...hook }), apiRouter());

  app.use("/auth", authRouter(rateLimit(deps.loginLimiter, loginKey, { failOpen: false, ...hook })));

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
