import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

/** Absolute path of the challenge/ folder (one level up from test/). */
export const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

/** Reads a project file, failing with a helpful message instead of ENOENT. */
export function readProjectFile(relative: string): string {
  const full = path.join(PROJECT_ROOT, relative);
  if (!existsSync(full)) {
    throw new Error(`Expected file challenge/${relative} to exist. Create it (see CHALLENGE.md).`);
  }
  return readFileSync(full, "utf8");
}
