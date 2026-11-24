import http from "node:http";
import { sendError } from "./respond.js";
import type { ServerOptions } from "./types.js";

export const DEFAULT_MAX_BODY_BYTES = 10_240;

/**
 * TODO(3b): wire everything together
 *
 * createServer(options) builds (but does NOT start) the HTTP server. Tests call
 * `.listen(0)` on what you return; server.ts listens on a real port.
 *
 *  1. Defaults: options.store ?? new InMemoryBookmarkStore(), and
 *     options.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES.
 *  2. Build a Router: GET /health → 200 { status: "ok" }, then
 *     registerBookmarkRoutes(router, { store, maxBodyBytes }).
 *  3. In the request listener:
 *     - parse req.url with `new URL(req.url ?? "/", "http://localhost")`
 *       (req.url is just the path + query, so URL needs a base)
 *     - router.match(req.method, url.pathname):
 *         not-found          → 404 ROUTE_NOT_FOUND
 *         method-not-allowed → 405 METHOD_NOT_ALLOWED + header Allow: "GET, HEAD, POST"
 *         found              → await handler({ req, res, url, params })
 *  4. Wrap all of it in try/catch. One place turns errors into responses:
 *     - HttpError → its status, code, message and headers
 *     - anything else → console.error it, then 500 INTERNAL_ERROR with a
 *       generic message (never leak error.message to the client)
 *     - if res.headersSent is already true, you can't send a new status:
 *       res.destroy() instead.
 *
 * The body is always { "error": { "code": "...", "message": "..." } }; use sendError().
 */
export function createServer(options: ServerOptions = {}): http.Server {
  return http.createServer((_req, res) => {
    sendError(res, 501, "NOT_IMPLEMENTED", "TODO: implement createServer in src/app.ts");
  });
}
