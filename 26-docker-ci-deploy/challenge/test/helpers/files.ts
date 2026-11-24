import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";

/** The challenge/ folder (tests always resolve paths from here, whatever the cwd). */
export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

export function projectPath(rel: string): string {
  return path.join(ROOT, rel);
}

export function readProjectFile(rel: string): string {
  const p = projectPath(rel);
  if (!existsSync(p)) throw new Error(`Expected ${rel} to exist in challenge/`);
  return readFileSync(p, "utf8");
}

/** Parses a YAML file and insists it's a mapping (not empty, not only comments). */
export function readYaml(rel: string): Record<string, unknown> {
  const doc: unknown = parse(readProjectFile(rel));
  if (typeof doc !== "object" || doc === null || Array.isArray(doc)) {
    throw new Error(`${rel} is empty or not a YAML mapping. Did you only leave the TODO comments?`);
  }
  return doc as Record<string, unknown>;
}

export function asRecord(value: unknown, what: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`Expected ${what} to be a mapping, got ${JSON.stringify(value)}`);
  }
  return value as Record<string, unknown>;
}
