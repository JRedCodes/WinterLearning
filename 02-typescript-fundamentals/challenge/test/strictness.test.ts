import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = fileURLToPath(new URL("..", import.meta.url));
const srcDir = join(root, "src");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return entry.name.endsWith(".ts") ? [full] : [];
  });
}

/** Blanks out comments and string/template contents so prose like "any key" doesn't count. */
function codeOnly(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/\/\/[^\n]*/g, " ")
    .replace(/(["'`])(?:\\.|(?!\1)[^\\\n])*\1/g, '""');
}

describe("strictness rules", () => {
  it("tsconfig keeps strict and noUncheckedIndexedAccess on", () => {
    const tsconfig = JSON.parse(readFileSync(join(root, "tsconfig.json"), "utf8")) as {
      compilerOptions?: Record<string, unknown>;
    };
    expect(tsconfig.compilerOptions?.strict, "tsconfig.json: strict must be true").toBe(true);
    expect(tsconfig.compilerOptions?.noUncheckedIndexedAccess, "tsconfig.json: noUncheckedIndexedAccess must be true").toBe(
      true,
    );
  });

  const files = sourceFiles(srcDir);

  it.each(files.map((f) => [f.slice(root.length)]))("%s does not use `any`", (relative) => {
    const code = codeOnly(readFileSync(join(root, relative), "utf8"));
    const offending = code
      .split("\n")
      .map((line, i) => ({ line: line.trim(), n: i + 1 }))
      .filter(({ line }) => /\bany\b/.test(line));
    expect(offending, `\`any\` found in ${relative}:\n${offending.map((o) => `  line ${o.n}: ${o.line}`).join("\n")}`).toEqual(
      [],
    );
  });

  it.each(files.map((f) => [f.slice(root.length)]))("%s does not silence the compiler", (relative) => {
    const source = readFileSync(join(root, relative), "utf8");
    expect(source, "no @ts-ignore / @ts-nocheck / @ts-expect-error in src/").not.toMatch(
      /@ts-(ignore|nocheck|expect-error)/,
    );
    expect(codeOnly(source), "no double assertions (`as unknown as X`) in src/").not.toMatch(/as\s+unknown\s+as/);
  });
});
