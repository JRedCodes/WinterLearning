import type { ErrorRequestHandler } from "express";

/**
 * TODO(6): Central error handler
 *
 * Every error in the app ends up here. Turn it into a consistent JSON body:
 *   { "error": { "code": string, "message": string, "requestId": string } }
 *
 *  - HttpError                        -> its status, code and message
 *  - Malformed JSON body (express.json throws an error with
 *    `type === "entity.parse.failed"`) -> 400, code "INVALID_JSON"
 *  - Anything else                    -> 500, code "INTERNAL_ERROR",
 *    message "Something went wrong". NEVER send the real message or stack
 *    to the client. Log it on the server instead (console.error).
 *
 * The current version leaks internal error messages. Replace it.
 */
// Express recognizes error handlers by their 4 parameters, so keep all four.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  res.status(500).send(String(err?.message ?? err));
};
