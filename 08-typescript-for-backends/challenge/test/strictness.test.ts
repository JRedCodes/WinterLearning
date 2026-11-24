import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = join(import.meta.dirname, "..", "src");

/** `as SomeType` is allowed only inside the brand constructors. */
const CAST_ALLOWED = new Set(["domain/ids.ts", "domain/money.ts"]);

function tsFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return tsFiles(p);
    return e.name.endsWith(".ts") ? [p] : [];
  });
}

/** Removes comments and string contents so prose like "any order" doesn't count. */
function codeOnly(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "")
    .replace(/`(?:\\.|[^`\\])*`/g, "``")
    .replace(/"(?:\\.|[^"\\\n])*"/g, '""')
    .replace(/'(?:\\.|[^'\\\n])*'/g, "''");
}

function findLines(pattern: RegExp, filter: (rel: string) => boolean = () => true): string[] {
  const hits: string[] = [];
  for (const file of tsFiles(SRC)) {
    const rel = relative(SRC, file).replaceAll("\\", "/");
    if (!filter(rel)) continue;
    codeOnly(readFileSync(file, "utf8"))
      .split("\n")
      .forEach((line, i) => {
        if (pattern.test(line)) hits.push(`src/${rel}:${i + 1}  ${line.trim()}`);
      });
  }
  return hits;
}

describe("strictness rules", () => {
  it("src/ contains no `any` (including .d.ts files)", () => {
    const hits = findLines(/\bany\b/);
    expect(hits, `Replace these with real types or \`unknown\`:\n${hits.join("\n")}`).toEqual([]);
  });

  it("src/ contains no `as` casts outside the brand constructors", () => {
    const hits = findLines(
      /\bas\s+(?!const\b)[A-Za-z_{[(]/,
      (rel) => !CAST_ALLOWED.has(rel),
    ).filter((line) => !/^\S+\s+(import|export)\b/.test(line));
    expect(hits, `Narrow, validate or construct instead of casting:\n${hits.join("\n")}`).toEqual([]);
  });
});
