export const SESSION_COOKIE = "sid";

export interface SessionCookieOptions {
  secure: boolean;
  maxAgeSeconds: number;
}

/**
 * TODO(3): Build the Set-Cookie header values for the session cookie.
 *
 * serializeSessionCookie("abc", { secure: false, maxAgeSeconds: 600 }) must contain:
 *   sid=abc          the value
 *   Path=/           sent on every path of the API
 *   HttpOnly         JavaScript (and therefore XSS) cannot read it
 *   SameSite=Lax     not sent on cross-site POSTs (first line of CSRF defense)
 *   Max-Age=600      expires in the browser together with the server-side session
 *   Secure           ONLY when opts.secure is true (cookie only travels over HTTPS)
 * Attributes are separated by "; ", e.g.
 *   "sid=abc; Path=/; HttpOnly; SameSite=Lax; Max-Age=600"
 *
 * clearSessionCookie(opts) returns a header that makes the browser delete the
 * cookie: empty value and Max-Age=0, with the SAME Path/HttpOnly/SameSite/Secure
 * attributes (a cookie is only replaced if name + path + domain match).
 */
export function serializeSessionCookie(_sessionId: string, _opts: SessionCookieOptions): string {
  throw new Error("Not implemented: TODO(3) serializeSessionCookie");
}

export function clearSessionCookie(_opts: Pick<SessionCookieOptions, "secure">): string {
  throw new Error("Not implemented: TODO(3) clearSessionCookie");
}

/** Parses a Cookie request header ("a=1; b=2") into an object. Given, no need to change. */
export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    const name = part.slice(0, eq).trim();
    const raw = part.slice(eq + 1).trim();
    if (!name || name in out) continue; // first occurrence wins, like most frameworks
    try {
      out[name] = decodeURIComponent(raw);
    } catch {
      out[name] = raw;
    }
  }
  return out;
}
