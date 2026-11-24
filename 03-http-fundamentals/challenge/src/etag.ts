/**
 * TODO(2): ETags
 *
 * computeEtag(body)
 *  - Return a STRONG entity tag for the response body: a hash of its bytes
 *    wrapped in double quotes, e.g. "\"3q2+7w...\"". The quotes are part of the
 *    header syntax. Use node:crypto's createHash (sha1 is fine: this is a
 *    fingerprint, not security) with a "base64url" digest.
 *
 * ifNoneMatchMatches(header, etag)
 *  - header is the raw If-None-Match request header (or undefined).
 *  - "*" matches anything.
 *  - The header can be a comma-separated list: "a", "b", W/"c".
 *  - If-None-Match uses WEAK comparison: ignore a leading W/ on either side.
 *  - Values must match exactly including quotes ("abc" does not match abc).
 *
 * Spec: test/etag.test.ts
 */
export function computeEtag(body: string): string {
  throw new Error("Not implemented: computeEtag (TODO 2)");
}

export function ifNoneMatchMatches(header: string | undefined, etag: string): boolean {
  throw new Error("Not implemented: ifNoneMatchMatches (TODO 2)");
}
