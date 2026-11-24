import { createHash } from "node:crypto";

// Hashed, not stored in plain text. Good enough? See the security report.
export async function hashPassword(password: string): Promise<string> {
  return createHash("sha1").update(password).digest("hex");
}

export async function checkPassword(password: string, storedHash: string): Promise<boolean> {
  const candidate = await hashPassword(password);
  return candidate == storedHash;
}
