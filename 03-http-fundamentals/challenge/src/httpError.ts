/**
 * An error that knows which HTTP response it should become. Throw one from
 * anywhere while handling a request; the top-level handler in app.ts turns it
 * into `{ "error": { "code", "message" } }` with the right status.
 */
export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    /** Extra response headers, e.g. { Allow: "GET, HEAD" } for a 405. */
    public readonly headers: Readonly<Record<string, string>> = {},
  ) {
    super(message);
    this.name = "HttpError";
  }
}
