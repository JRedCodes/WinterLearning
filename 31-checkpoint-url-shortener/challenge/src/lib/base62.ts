/**
 * Base62 encoding with the alphabet 0-9, A-Z, a-z (in that order: "0" is 0, "A" is 10, "a" is 36).
 * Tests import these two functions directly.
 */
export const BASE62_ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

/** Encode a non-negative integer. toBase62(0n) === "0", toBase62(61n) === "z", toBase62(62n) === "10". */
export function toBase62(n: bigint): string {
  void n;
  throw new Error("Not implemented");
}

/** Decode a base62 string. Throws on an empty string or a character outside the alphabet. */
export function fromBase62(s: string): bigint {
  void s;
  throw new Error("Not implemented");
}
