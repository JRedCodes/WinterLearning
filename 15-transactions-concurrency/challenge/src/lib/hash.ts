import { createHash } from "node:crypto";

/** Stable fingerprint of a request body (keys sorted so {a,b} and {b,a} match). */
export function hashRequest(body: Record<string, unknown>): string {
  const canonical = JSON.stringify(Object.keys(body).sort().map((k) => [k, body[k]]));
  return createHash("sha256").update(canonical).digest("hex");
}
