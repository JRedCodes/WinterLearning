import type { OutgoingHttpHeaders, ServerResponse } from "node:http";

/**
 * Given helpers for writing responses. Read them: they show the raw
 * mechanics that frameworks like Express hide behind `res.json()`.
 */

/** Serializes `body` as JSON and sends it with Content-Type and Content-Length. */
export function sendJson(res: ServerResponse, status: number, body: unknown, headers: OutgoingHttpHeaders = {}): void {
  const payload = JSON.stringify(body);
  sendRaw(res, status, payload, headers);
}

/**
 * Sends an already-serialized JSON string. Useful when you need the exact
 * bytes first (for example to compute an ETag from them).
 *
 * For a HEAD request, Node's ServerResponse automatically drops the body but
 * keeps the headers, so HEAD handlers can call this exactly like GET handlers.
 */
export function sendRaw(res: ServerResponse, status: number, payload: string, headers: OutgoingHttpHeaders = {}): void {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(payload),
    ...headers,
  });
  res.end(payload);
}

/** Sends a response with no body at all (204 No Content, 304 Not Modified). */
export function sendEmpty(res: ServerResponse, status: number, headers: OutgoingHttpHeaders = {}): void {
  res.writeHead(status, headers);
  res.end();
}

/** The one error format every endpoint uses. */
export function sendError(
  res: ServerResponse,
  status: number,
  code: string,
  message: string,
  headers: OutgoingHttpHeaders = {},
): void {
  sendJson(res, status, { error: { code, message } }, headers);
}
