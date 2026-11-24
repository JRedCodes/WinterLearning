import type { BookmarkInput } from "./types.js";

/**
 * TODO(4a): validate a bookmark body
 *
 * Turn the untrusted parsed JSON into a BookmarkInput or throw
 * HttpError(400, "VALIDATION_ERROR", <helpful message>).
 *
 *  - body must be a JSON object (not null, not an array)
 *  - url: required string, at most 2048 chars, an absolute URL (`new URL(url)`
 *    throws otherwise) whose protocol is http: or https:
 *  - title: optional string; trimmed; 1–200 chars. Defaults to the url.
 *  - tags: optional array of strings; each trimmed and lowercased, 1–30 chars;
 *    duplicates removed (keep first occurrence order); at most 10. Default [].
 *
 * Unknown fields are ignored (they are never copied into the result).
 */
export function parseBookmarkInput(body: unknown): BookmarkInput {
  throw new Error("Not implemented: parseBookmarkInput (TODO 4)");
}
