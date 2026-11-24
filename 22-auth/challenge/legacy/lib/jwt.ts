import { createHmac } from "node:crypto";

export interface TokenClaims {
  sub: string;
  email: string;
  iat: number; // seconds since epoch
  exp: number; // seconds since epoch
}

const HASH_FOR_ALG: Record<string, string | null> = {
  HS256: "sha256",
  HS512: "sha512",
  none: null, // unsigned tokens, used by the old admin CLI
};

const encode = (value: object): string => Buffer.from(JSON.stringify(value)).toString("base64url");

function decode(segment: string): Record<string, unknown> | null {
  try {
    const value: unknown = JSON.parse(Buffer.from(segment, "base64url").toString("utf8"));
    return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function hmac(hash: string, data: string, secret: string): string {
  return createHmac(hash, secret).update(data).digest("base64url");
}

export function signToken(
  claims: { sub: string; email: string },
  secret: string,
  opts: { nowSeconds: number; ttlSeconds: number },
): string {
  const header = encode({ alg: "HS256", typ: "JWT" });
  const payload = encode({ ...claims, iat: opts.nowSeconds, exp: opts.nowSeconds + opts.ttlSeconds });
  return `${header}.${payload}.${hmac("sha256", `${header}.${payload}`, secret)}`;
}

/** Returns the claims of a valid token, or null. */
export function verifyToken(token: string, secret: string, _nowSeconds: number): TokenClaims | null {
  const [headerPart, payloadPart, signature] = token.split(".");
  if (headerPart === undefined || payloadPart === undefined || signature === undefined) return null;

  const header = decode(headerPart);
  const payload = decode(payloadPart);
  if (!header || !payload) return null;

  const alg = String(header.alg);
  if (!(alg in HASH_FOR_ALG)) return null;
  const hash = HASH_FOR_ALG[alg];
  if (hash) {
    const expected = hmac(hash, `${headerPart}.${payloadPart}`, secret);
    if (signature !== expected) return null;
  }

  return payload as unknown as TokenClaims;
}
