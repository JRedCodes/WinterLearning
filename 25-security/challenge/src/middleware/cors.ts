import type { RequestHandler } from "express";

export interface CorsOptions {
  /** Origins allowed to call the API from a browser, e.g. ["https://app.example.com"]. */
  allowedOrigins: string[];
}

/**
 * CORS for the web frontend. The frontend sends cookies/credentials,
 * so we need Access-Control-Allow-Credentials.
 */
export function cors(_options: CorsOptions): RequestHandler {
  return (req, res, next) => {
    const origin = req.get("origin");
    if (origin) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Access-Control-Allow-Credentials", "true");
    }
    if (req.method === "OPTIONS") {
      res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,PUT,DELETE");
      res.setHeader("Access-Control-Allow-Headers", "Authorization,Content-Type");
      res.setHeader("Access-Control-Max-Age", "600");
      res.status(204).end();
      return;
    }
    next();
  };
}
