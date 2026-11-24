import type { Router } from "./router.js";
import type { BookmarkStore } from "./types.js";

export interface BookmarkRouteDeps {
  readonly store: BookmarkStore;
  readonly maxBodyBytes: number;
}

/**
 * TODO(4b) + TODO(5): register the /bookmarks routes on the router
 *
 * Use the helpers in respond.ts (sendJson / sendRaw / sendEmpty) to write
 * responses, readJsonBody + parseBookmarkInput for request bodies, and THROW
 * HttpError for client errors (the top-level handler in app.ts formats them).
 *
 *   GET    /bookmarks           200 { data: Bookmark[] }   ?tag=x filters (case-insensitive)
 *   POST   /bookmarks           201 { data: Bookmark }     + Location: /bookmarks/<id>
 *   GET    /bookmarks/:id       200 { data: Bookmark }     404 NOT_FOUND if missing
 *   PUT    /bookmarks/:id       200 { data: Bookmark }     full replace; 404 if missing
 *   DELETE /bookmarks/:id       204, no body               404 if missing
 *
 * TODO(5) conditional GET on GET /bookmarks/:id:
 *  - Serialize the body yourself (JSON.stringify), compute its ETag, and send
 *    headers ETag + "Cache-Control: no-cache" (sendRaw takes the string).
 *  - If the request's If-None-Match matches, send 304 with the same headers
 *    and NO body (sendEmpty).
 *  - HEAD is routed to this same handler by your router. Node drops the body
 *    for HEAD responses automatically, so nothing else is needed.
 */
export function registerBookmarkRoutes(router: Router, deps: BookmarkRouteDeps): void {
  throw new Error("Not implemented: registerBookmarkRoutes (TODO 4)");
}
