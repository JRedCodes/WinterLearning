import type { RouteHandler } from "./types.js";

/** What `match()` can tell you about a request. Given; don't change it. */
export type MatchResult =
  | { readonly kind: "found"; readonly handler: RouteHandler; readonly params: Record<string, string> }
  | { readonly kind: "method-not-allowed"; readonly allowed: string[] }
  | { readonly kind: "not-found" };

/**
 * TODO(1): a tiny method + path router
 *
 *   const router = new Router()
 *     .add("GET", "/bookmarks", list)
 *     .add("GET", "/bookmarks/:id", show);
 *   router.match("GET", "/bookmarks/42")  // { kind: "found", handler: show, params: { id: "42" } }
 *
 * add(method, pattern, handler)
 *  - stores the route and returns `this` so calls can be chained.
 *
 * match(method, pathname)
 *  - Compare pattern and path segment by segment (split on "/"). Same number
 *    of segments; literal segments must be equal; ":name" segments capture the
 *    value into params (URL-decoded with decodeURIComponent).
 *  - An empty segment never matches a param ("/bookmarks/" is not found).
 *  - Malformed percent-encoding (decodeURIComponent throws) → no match.
 *  - Method names are case-insensitive. Routes are tried in registration order.
 *  - HEAD requests match GET routes (HEAD = GET without the body).
 *  - If the path matches some route but not with this method, return
 *    { kind: "method-not-allowed", allowed } where allowed is the sorted list
 *    of methods that DO match, including "HEAD" whenever "GET" is there.
 *  - Otherwise { kind: "not-found" }.
 *
 * Spec: test/router.test.ts
 */
export class Router {
  add(method: string, pattern: string, handler: RouteHandler): this {
    throw new Error("Not implemented: Router.add (TODO 1)");
  }

  match(method: string, pathname: string): MatchResult {
    throw new Error("Not implemented: Router.match (TODO 1)");
  }
}
