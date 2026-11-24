import type { ErrorRequestHandler, RequestHandler } from "express";

export interface ProblemOptions {
  /** e.g. "https://api.wl.example/problems/" -> type "https://api.wl.example/problems/not-found" */
  baseUrl: string;
}

/**
 * TODO(2): RFC 9457 Problem Details for every error response.
 *
 * Every error leaves the API as:
 *   Content-Type: application/problem+json
 *   {
 *     "type":     "<baseUrl><kind>",          e.g. ".../problems/not-found"
 *     "title":    short, fixed per kind,       e.g. "Not Found"
 *     "status":   the HTTP status (number, same as the response status),
 *     "detail":   the error's message,         e.g. "Task not found"
 *     "instance": req.originalUrl,
 *     "errors":   [{ pointer, detail }]        ONLY for ValidationError with field errors
 *   }
 *
 * Mapping (DomainError.kind -> status, title):
 *   validation-error          400  "Validation Failed"
 *   not-found                 404  "Not Found"
 *   idempotency-key-in-flight 409  "Idempotency Key In Flight"
 *   precondition-failed       412  "Precondition Failed"
 *   idempotency-key-reused    422  "Idempotency Key Reused"
 *   precondition-required     428  "Precondition Required"
 *
 * Special cases:
 *   - malformed JSON body (express.json throws an error with
 *     type === "entity.parse.failed") -> validation-error, 400,
 *     detail "Request body is not valid JSON"
 *   - anything else -> 500, type "about:blank", title "Internal Server Error",
 *     NO detail (never leak internals), and console.error it
 *   - if res.headersSent, do nothing
 *
 * notFoundHandler: unknown routes -> the same not-found problem, with
 * detail `No route for ${req.method} ${req.path}`.
 *
 * Tip: set the Content-Type header BEFORE calling res.json(), otherwise
 * Express sets application/json.
 */
export function problemDetails(_opts: ProblemOptions): {
  notFoundHandler: RequestHandler;
  errorHandler: ErrorRequestHandler;
} {
  return {
    notFoundHandler: (_req, res) => {
      res.status(404).send("Not found");
    },
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    errorHandler: (err, _req, res, _next) => {
      res.status(500).json({ error: String((err as Error)?.message ?? err) });
    },
  };
}
