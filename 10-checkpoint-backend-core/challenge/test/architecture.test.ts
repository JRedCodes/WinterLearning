/**
 * Architecture rules. These keep the layering honest:
 * HTTP stays at the edge, business logic and data access don't know
 * about Express, and configuration is read in exactly one place.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = join(import.meta.dirname, "..", "src");

function tsFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return tsFiles(p);
    return name.endsWith(".ts") ? [p] : [];
  });
}

const rel = (p: string) => relative(join(SRC, ".."), p).replaceAll("\\", "/");
/** Source without comments, so a comment mentioning process.env doesn't count. */
const read = (p: string) =>
  readFileSync(p, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
const CORE_LAYERS = ["services", "repositories", "domain"] as const;
const coreFiles = () => CORE_LAYERS.flatMap((d) => tsFiles(join(SRC, d)));

describe("architecture", () => {
  it.each(CORE_LAYERS)("has a src/%s layer with at least one .ts file", (layer) => {
    expect(tsFiles(join(SRC, layer)).length, `create src/${layer}/`).toBeGreaterThan(0);
  });

  it("has an HTTP layer in src/routes or src/controllers", () => {
    const http = [...tsFiles(join(SRC, "routes")), ...tsFiles(join(SRC, "controllers"))];
    expect(http.length, "create src/routes/ and/or src/controllers/").toBeGreaterThan(0);
  });

  it("keeps express out of services, repositories and domain", () => {
    const offenders = coreFiles().filter((f) => /from\s+["']express["']|import\(\s*["']express["']\s*\)|require\(\s*["']express["']\s*\)/.test(read(f)));
    expect(offenders.map(rel), "these files import express").toEqual([]);
  });

  it("core layers never import from the HTTP layer", () => {
    const offenders = coreFiles().filter((f) => /from\s+["'][^"']*\/(routes|controllers|middleware)\//.test(read(f)));
    expect(offenders.map(rel), "dependencies must point inward").toEqual([]);
  });

  it("reads process.env only in src/config.ts", () => {
    const offenders = tsFiles(SRC).filter((f) => rel(f) !== "src/config.ts" && /process\.env/.test(read(f)));
    expect(offenders.map(rel)).toEqual([]);
  });

  it("defines a repository interface and an in-memory class implementing it", () => {
    const repoSource = tsFiles(join(SRC, "repositories")).map(read).join("\n");
    expect(repoSource, "export an interface named *Repository").toMatch(/export\s+interface\s+\w+Repository\b/);
    expect(repoSource, "add a class that `implements` a *Repository interface").toMatch(/class\s+\w+\s+implements\s+\w*Repository\b/);
  });

  it("src/app.ts builds the app but never listens", () => {
    expect(read(join(SRC, "app.ts"))).not.toMatch(/\.listen\(/);
  });
});
