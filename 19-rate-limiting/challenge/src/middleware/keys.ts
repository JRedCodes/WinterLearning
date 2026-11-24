import type { Request } from "express";

/**
 * TODO(5): Who are we counting?
 *
 * apiKeyOrIp(req):
 *   - If the request has a non-empty `X-API-Key` header → a key derived from
 *     the API key, e.g. "key:<sha256 of the api key>". Don't put the raw
 *     secret in a Redis key name (it would show up in MONITOR, SCAN, logs...).
 *   - Otherwise → "ip:<req.ip>".
 *
 * loginKey(req):
 *   - Combines req.ip AND the (trimmed, lowercased) `username` from the JSON
 *     body, so "Ada" and " ada " share a limit, but different users or
 *     different IPs don't. Missing username → treat as "".
 */
export function apiKeyOrIp(req: Request): string {
  void req;
  throw new Error("Not implemented: apiKeyOrIp (TODO 5)");
}

export function loginKey(req: Request): string {
  void req;
  throw new Error("Not implemented: loginKey (TODO 5)");
}
