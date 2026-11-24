/**
 * Architecture tests: they read your source files and check the rules of the
 * layered design. No HTTP, no running code. Just "who is allowed to import whom".
 *
 * These FAIL on the starter. They pass once the god file is split up properly.
 * See "Target structure" in CHALLENGE.md.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "src");

function listTs(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return listTs(full);
    return name.endsWith(".ts") ? [full] : [];
  });
}

/** Source without comments, so a comment that mentions `process.env` doesn't count. */
function code(file: string): string {
  return readFileSync(file, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
}

const rel = (file: string) => relative(ROOT, file).split(sep).join("/");

/** Import specifiers of a file: `import x from "y"`, `export * from "y"`, `import("y")`. */
function importsOf(file: string): string[] {
  const out: string[] = [];
  const re = /(?:\bfrom\s*|\bimport\s*\(?\s*)["']([^"']+)["']/g;
  for (const m of code(file).matchAll(re)) out.push(m[1]!);
  return out;
}

/** Which top-level folder of src/ an import points at ("services", "app.ts", ...), or the package name. */
function targetOf(file: string, spec: string): string {
  if (!spec.startsWith(".")) return spec;
  const abs = resolve(dirname(file), spec);
  const first = relative(SRC, abs).split(sep)[0] ?? "";
  return first.replace(/\.js$/, ".ts");
}

function violations(layer: string, forbidden: string[]): string[] {
  const bad: string[] = [];
  for (const file of listTs(join(SRC, layer))) {
    for (const spec of importsOf(file)) {
      const target = targetOf(file, spec);
      if (forbidden.includes(target)) bad.push(`${rel(file)} imports "${spec}"`);
    }
  }
  return bad;
}

const lineCount = (file: string) => readFileSync(file, "utf8").split("\n").length;

describe("target structure exists", () => {
  it.each([
    "src/app.ts",
    "src/server.ts",
    "src/config.ts",
    "src/container.ts",
    "src/domain/event.ts",
    "src/domain/rsvp.ts",
    "src/domain/errors.ts",
    "src/repositories/eventRepository.ts",
    "src/repositories/rsvpRepository.ts",
    "src/services/eventService.ts",
    "src/services/rsvpService.ts",
    "src/middleware/errorHandler.ts",
    "src/lib/clock.ts",
    "src/lib/ids.ts",
  ])("%s exists", (path) => {
    expect(existsSync(join(ROOT, path)), `create ${path} (see CHALLENGE.md, Target structure)`).toBe(true);
  });

  it.each(["controllers", "routes"])("src/%s/ contains at least one module", (dir) => {
    expect(listTs(join(SRC, dir)).length, `put your ${dir} in src/${dir}/`).toBeGreaterThan(0);
  });
});

describe("the god file is gone", () => {
  it("src/app.ts only assembles the app (at most 80 lines)", () => {
    const n = lineCount(join(SRC, "app.ts"));
    expect(n, `src/app.ts has ${n} lines. It should only wire middleware and routers.`).toBeLessThanOrEqual(80);
  });

  it("no file in src/ is longer than 200 lines", () => {
    const tooLong = listTs(SRC)
      .filter((f) => lineCount(f) > 200)
      .map((f) => `${rel(f)} (${lineCount(f)} lines)`);
    expect(tooLong, "split these files up").toEqual([]);
  });
});

describe("dependency direction (outer layers depend on inner layers, never the reverse)", () => {
  const WEB = ["express", "controllers", "routes", "middleware", "app.ts", "server.ts", "container.ts"];

  it("domain/ depends on nothing outside domain/ (no express, services, repositories, config)", () => {
    expect(
      violations("domain", [...WEB, "services", "repositories", "config.ts"]),
    ).toEqual([]);
  });

  it("services/ know nothing about HTTP or Express", () => {
    expect(violations("services", WEB)).toEqual([]);
  });

  it("repositories/ know nothing about HTTP, Express or services", () => {
    expect(violations("repositories", [...WEB, "services"])).toEqual([]);
  });

  it("controllers/ go through services, never straight to repositories", () => {
    expect(violations("controllers", ["repositories"])).toEqual([]);
  });

  it("domain/ and services/ make no HTTP status decisions", () => {
    const statusCode = /\b(?:status(?:Code)?|httpStatus)\s*[:=(]\s*[1-5]\d\d\b/;
    const offenders = [...listTs(join(SRC, "domain")), ...listTs(join(SRC, "services"))]
      .filter((f) => statusCode.test(code(f)))
      .map(rel);
    expect(offenders, "map domain errors to status codes in the error handler instead").toEqual([]);
  });
});

describe("configuration", () => {
  it("process.env is read only in src/config.ts", () => {
    const readers = listTs(SRC)
      .filter((f) => /process\.env/.test(code(f)))
      .map(rel)
      .filter((f) => f !== "src/config.ts");
    expect(readers, "read env once in config.ts and pass values in").toEqual([]);
  });
});
