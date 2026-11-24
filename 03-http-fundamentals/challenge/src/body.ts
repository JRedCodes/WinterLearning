import type { IncomingMessage } from "node:http";

/**
 * TODO(3a): read a JSON request body safely
 *
 * Node gives you the body as a stream of Buffer chunks (`for await (const
 * chunk of req)`). Nothing protects you from a 2 GB upload or from text that
 * isn't JSON: that's your job here. Throw an HttpError (src/httpError.ts):
 *
 *  - 415 UNSUPPORTED_MEDIA_TYPE unless the Content-Type's media type is
 *    application/json. Parameters are allowed: "application/json; charset=utf-8".
 *    Compare case-insensitively. A missing header is a 415 too.
 *  - 413 PAYLOAD_TOO_LARGE if the body is larger than `limit` bytes. Check the
 *    Content-Length header up front if present, AND count bytes as they
 *    arrive (chunked requests have no Content-Length, and headers can lie).
 *    Stop buffering as soon as you pass the limit.
 *  - 400 INVALID_JSON if the body is empty or isn't valid JSON.
 *
 * Return the parsed value typed as `unknown`: you don't know its shape yet.
 */
export async function readJsonBody(req: IncomingMessage, limit: number): Promise<unknown> {
  throw new Error("Not implemented: readJsonBody (TODO 3)");
}
