import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "../src/lib/password.js";

describe("TODO(1) · password hashing with scrypt", () => {
  it("produces a self-describing scrypt$N$r$p$salt$hash string", async () => {
    const stored = await hashPassword("hunter2-but-longer");
    const parts = stored.split("$");
    expect(parts, `got "${stored}"`).toHaveLength(6);
    const [scheme, n, r, p, salt, hash] = parts;
    expect(scheme).toBe("scrypt");
    expect(Number(n)).toBeGreaterThanOrEqual(16_384);
    expect(Number(r)).toBeGreaterThanOrEqual(8);
    expect(Number(p)).toBeGreaterThanOrEqual(1);
    expect(Buffer.from(salt!, "base64").length, "salt should be at least 16 bytes").toBeGreaterThanOrEqual(16);
    expect(Buffer.from(hash!, "base64").length, "derived key should be at least 32 bytes").toBeGreaterThanOrEqual(32);
  });

  it("never contains the password or a fast unsalted digest of it", async () => {
    const pw = "my secret passphrase";
    const stored = await hashPassword(pw);
    expect(stored).not.toContain(pw);
    for (const algo of ["md5", "sha1", "sha256"]) {
      const hex = createHash(algo).update(pw).digest("hex");
      const b64 = createHash(algo).update(pw).digest("base64");
      expect(stored).not.toContain(hex);
      expect(stored).not.toContain(b64);
    }
  });

  it("uses a fresh salt each time: same password, different hashes", async () => {
    const a = await hashPassword("same password here");
    const b = await hashPassword("same password here");
    expect(a).not.toBe(b);
  });

  it("verifies the right password and rejects wrong ones", async () => {
    const stored = await hashPassword("correct horse battery staple");
    expect(await verifyPassword("correct horse battery staple", stored)).toBe(true);
    expect(await verifyPassword("correct horse battery stapl", stored)).toBe(false);
    expect(await verifyPassword("Correct horse battery staple", stored)).toBe(false);
    expect(await verifyPassword("", stored)).toBe(false);
  });

  it("verifies using the parameters stored in the hash (so cost can be raised later)", async () => {
    // A hash made with different (cheaper) parameters must still verify.
    const { scryptSync, randomBytes } = await import("node:crypto");
    const salt = randomBytes(16);
    const key = scryptSync("legacy pw", salt, 32, { N: 1024, r: 8, p: 1 });
    const stored = `scrypt$1024$8$1$${salt.toString("base64")}$${key.toString("base64")}`;
    expect(await verifyPassword("legacy pw", stored)).toBe(true);
    expect(await verifyPassword("other pw", stored)).toBe(false);
  });

  it.each([
    ["empty string", ""],
    ["plain text", "hunter2"],
    ["wrong scheme", "bcrypt$10$abc$def$ghi$jkl"],
    ["missing parts", "scrypt$16384$8$1$c2FsdA=="],
    ["non-numeric cost", "scrypt$abc$8$1$c2FsdA==$aGFzaA=="],
  ])("returns false (does not throw) for a malformed stored value: %s", async (_label, stored) => {
    await expect(verifyPassword("whatever", stored)).resolves.toBe(false);
  });
});
