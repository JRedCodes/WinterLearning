import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const SRC = path.resolve(import.meta.dirname, "../src");

function filesIn(dir: string): string[] {
  const abs = path.join(SRC, dir);
  if (!existsSync(abs)) return [];
  return readdirSync(abs).flatMap((name) => {
    const full = path.join(abs, name);
    if (statSync(full).isDirectory()) return filesIn(path.join(dir, name));
    return name.endsWith(".ts") ? [path.join(dir, name)] : [];
  });
}
const read = (rel: string) => readFileSync(path.join(SRC, rel), "utf8");
/** Source without comments, so a comment mentioning process.env doesn't count. */
const code = (rel: string) =>
  read(rel)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
const importsOf = (rel: string) =>
  [...read(rel).matchAll(/(?:import|export)\s[^;]*?from\s+["']([^"']+)["']/g)].map((m) => m[1]!);

describe("architecture", () => {
  it("has the layered folders: domain, services, repositories and routes or controllers", () => {
    for (const dir of ["domain", "services", "repositories"]) {
      expect(filesIn(dir).length, `src/${dir}/ should contain .ts files`).toBeGreaterThan(0);
    }
    expect(filesIn("routes").length + filesIn("controllers").length, "src/routes/ or src/controllers/").toBeGreaterThan(0);
  });

  it("services, repositories and domain don't depend on express", () => {
    const offenders = ["services", "repositories", "domain"]
      .flatMap(filesIn)
      .filter((f) => importsOf(f).some((i) => i === "express" || i.startsWith("express/")));
    expect(offenders, "HTTP belongs in routes/controllers/middleware").toEqual([]);
  });

  it("domain doesn't depend on pg either", () => {
    const offenders = filesIn("domain").filter((f) => importsOf(f).includes("pg"));
    expect(offenders).toEqual([]);
  });

  it("routes/controllers contain no SQL and don't import pg", () => {
    const sql = /\b(SELECT\s[\s\S]*\bFROM|INSERT\s+INTO|UPDATE\s+\w+\s+SET|DELETE\s+FROM)\b/;
    const offenders = [...filesIn("routes"), ...filesIn("controllers")].filter(
      (f) => importsOf(f).includes("pg") || sql.test(code(f)),
    );
    expect(offenders, "SQL lives in repositories").toEqual([]);
  });

  it("process.env is read only in src/config.ts", () => {
    expect(existsSync(path.join(SRC, "config.ts")), "src/config.ts exists").toBe(true);
    const offenders = filesIn(".")
      .map((f) => path.normalize(f))
      .filter((f) => f !== "config.ts" && code(f).includes("process.env"));
    expect(offenders).toEqual([]);
  });

  it("app.ts builds the app without listening; server.ts is the composition root", () => {
    expect(existsSync(path.join(SRC, "app.ts")), "src/app.ts exists").toBe(true);
    expect(existsSync(path.join(SRC, "server.ts")), "src/server.ts exists").toBe(true);
    expect(read("app.ts")).toMatch(/export\s+(async\s+)?function\s+createApp|export\s+const\s+createApp/);
    expect(code("app.ts")).not.toMatch(/\.listen\(/);
    expect(code("server.ts")).toMatch(/\.listen\(/);
  });
});
