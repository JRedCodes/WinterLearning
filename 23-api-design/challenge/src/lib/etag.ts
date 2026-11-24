/**
 * TODO(5a): ETag helpers. Our ETags are STRONG validators built from the task's
 * version number: version 3 -> the header value  "3"  (with the double quotes,
 * they're part of the ETag syntax).
 *
 * etagFor(version)           -> '"3"'
 *
 * parseIfMatch(header)       -> what the client says it last saw
 *   undefined / ""           -> undefined           (header absent)
 *   '*'                      -> "*"
 *   '"3"'                    -> [3]
 *   '"3", "4"'               -> [3, 4]             (a list is allowed)
 *   'W/"3"'                  -> []                 (weak ETags never match for If-Match:
 *                                                   strong comparison, RFC 9110 §13.1.1)
 *   anything unparseable     -> []                 (matches nothing -> 412)
 *
 * ifNoneMatchHits(header, version) -> true if a GET can answer 304:
 *   '*' matches; otherwise any listed ETag equal to etagFor(version), and here
 *   WEAK comparison is used, so 'W/"3"' also matches version 3.
 */
export function etagFor(_version: number): string {
  throw new Error("Not implemented: TODO(5a) etagFor");
}

export function parseIfMatch(_header: string | undefined): "*" | number[] | undefined {
  throw new Error("Not implemented: TODO(5a) parseIfMatch");
}

export function ifNoneMatchHits(_header: string | undefined, _version: number): boolean {
  throw new Error("Not implemented: TODO(5a) ifNoneMatchHits");
}
