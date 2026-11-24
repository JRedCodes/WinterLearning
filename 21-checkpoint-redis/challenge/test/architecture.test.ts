import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = join(import.meta.dirname, "..", "src");

function filesIn(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? filesIn(full) : full.endsWith(".ts") ? [full] : [];
  });
}

const importsOf = (file: string) =>
  [...readFileSync(file, "utf8").matchAll(/from\s+["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/g)].map(
    (m) => m[1] ?? m[2] ?? "",
  );

describe("architecture", () => {
  it("has the layered folders: services/ and repositories/ with code in them", () => {
    expect(filesIn(join(SRC, "services")).length, "put business logic in src/services/").toBeGreaterThan(0);
    expect(filesIn(join(SRC, "repositories")).length, "put data access in src/repositories/").toBeGreaterThan(0);
    expect(existsSync(join(SRC, "server.ts")), "src/server.ts is the composition root for production").toBe(true);
  });

  it("reads process.env only in src/config.ts", () => {
    expect(existsSync(join(SRC, "config.ts")), "src/config.ts must exist").toBe(true);
    const offenders = filesIn(SRC)
      .filter((f) => !f.endsWith("config.ts"))
      .filter((f) => readFileSync(f, "utf8").includes("process.env"))
      .map((f) => relative(SRC, f));
    expect(offenders).toEqual([]);
  });

  it("services depend on ports, not on infrastructure or HTTP", () => {
    const banned = ["express", "pg", "ioredis", "bullmq"];
    const offenders = filesIn(join(SRC, "services")).flatMap((f) =>
      importsOf(f)
        .filter((i) => banned.includes(i))
        .map((i) => `${relative(SRC, f)} imports ${i}`),
    );
    expect(offenders).toEqual([]);
  });

  it("repositories don't know about HTTP", () => {
    const offenders = filesIn(join(SRC, "repositories")).flatMap((f) =>
      importsOf(f)
        .filter((i) => i === "express")
        .map(() => relative(SRC, f)),
    );
    expect(offenders).toEqual([]);
  });

  it("the HTTP layer (routes/, controllers/, middleware/) doesn't talk to Postgres directly", () => {
    const http = ["routes", "controllers", "middleware"].flatMap((d) => filesIn(join(SRC, d)));
    expect(http.length, "put your Express routers in src/routes/ (or src/controllers/)").toBeGreaterThan(0);
    const offenders = http.flatMap((f) =>
      importsOf(f)
        .filter((i) => i === "pg")
        .map(() => relative(SRC, f)),
    );
    expect(offenders).toEqual([]);
  });
});
