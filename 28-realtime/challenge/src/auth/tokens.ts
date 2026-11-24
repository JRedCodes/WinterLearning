import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Tiny signed tokens: `<base64url(username)>.<base64url(hmac)>`.
 *
 * This stands in for whatever your real auth issues (a session lookup, a JWT,
 * a short-lived "ws ticket" from module 22). The chat server only needs one
 * thing from auth: "given this token, who is it, or nobody?"
 */
export function signToken(user: string, secret: string): string {
  const payload = Buffer.from(user, "utf8").toString("base64url");
  return `${payload}.${mac(payload, secret)}`;
}

/** Returns the username, or null when the token is missing, malformed or forged. */
export function verifyToken(token: string, secret: string): string | null {
  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra !== undefined) return null;
  const expected = Buffer.from(mac(payload, secret));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  const user = Buffer.from(payload, "base64url").toString("utf8");
  return /^[A-Za-z0-9_-]{1,32}$/.test(user) ? user : null;
}

function mac(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}
