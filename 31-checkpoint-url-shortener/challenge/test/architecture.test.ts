import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ROOT } from "./helpers/env.js";

function files(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const p = path.join(dir, name);
    return statSync(p).isDirectory() ? files(p) : p.endsWith(".ts") ? [p] : [];
  });
}
const SRC = path.join(ROOT, "src");
const rel = (p: string) => path.relative(SRC, p).split(path.sep).join("/");
const read = (p: string) => readFileSync(p, "utf8");

describe("architecture (layered: routes/controllers → services → repositories)", () => {
  it("has src/app.ts plus at least one file in each of services/, repositories/ and controllers/ (or routes/)", () => {
    expect(existsSync(path.join(SRC, "app.ts")), "src/app.ts should build the Express app").toBe(true);
    expect(files(path.join(SRC, "services")).length, "src/services/ is empty").toBeGreaterThan(0);
    expect(files(path.join(SRC, "repositories")).length, "src/repositories/ is empty").toBeGreaterThan(0);
    const http = files(path.join(SRC, "controllers")).length + files(path.join(SRC, "routes")).length;
    expect(http, "src/controllers/ or src/routes/ should hold the HTTP layer").toBeGreaterThan(0);
  });

  it("only src/config.ts reads process.env", () => {
    const offenders = files(SRC).filter((f) => rel(f) !== "config.ts" && /process\.env/.test(read(f)));
    expect(offenders.map(rel)).toEqual([]);
  });

  it("services/ and repositories/ don't import express", () => {
    const offenders = files(SRC).filter(
      (f) => /^(services|repositories|domain)\//.test(rel(f)) && /from\s+["']express["']/.test(read(f)),
    );
    expect(offenders.map(rel)).toEqual([]);
  });

  it("the HTTP layer and services don't talk to pg or ioredis directly (that's what repositories are for)", () => {
    const offenders = files(SRC).filter(
      (f) =>
        /^(routes|controllers|middleware|services|domain)\//.test(rel(f)) &&
        /from\s+["'](pg|ioredis)["']/.test(read(f).replace(/import\s+type[^;]+;/g, "")),
    );
    expect(offenders.map(rel)).toEqual([]);
  });
});
