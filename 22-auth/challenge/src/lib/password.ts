/**
 * TODO(1): Password hashing with scrypt (node:crypto, no native dependencies).
 *
 * hashPassword(password)
 *   - generate a fresh random salt for EVERY password (16 bytes from randomBytes)
 *   - derive a 64-byte key with scrypt using the parameters below
 *   - return a self-describing string so we can raise the cost later without
 *     breaking old hashes:
 *         scrypt$<N>$<r>$<p>$<salt base64>$<hash base64>
 *     e.g. "scrypt$16384$8$1$Zm9vYmFy...$c2VjcmV0..."
 *
 * verifyPassword(password, stored)
 *   - parse the stored string; if it is malformed, return false (never throw)
 *   - re-derive the key with the SAME salt and parameters that are stored in it
 *   - compare with crypto.timingSafeEqual (lengths must match first), not ===
 *
 * Useful imports: randomBytes, scrypt, timingSafeEqual from "node:crypto";
 * promisify from "node:util" (or wrap scrypt in a Promise yourself, which also
 * lets you pass the options object cleanly).
 */

/** Cost parameters. N must be a power of two. 128 * N * r bytes of memory = 16 MiB here. */
export const SCRYPT_PARAMS = { N: 16_384, r: 8, p: 1, keyLength: 64, saltLength: 16 } as const;

export async function hashPassword(_password: string): Promise<string> {
  throw new Error("Not implemented: TODO(1) hashPassword");
}

export async function verifyPassword(_password: string, _stored: string): Promise<boolean> {
  throw new Error("Not implemented: TODO(1) verifyPassword");
}
