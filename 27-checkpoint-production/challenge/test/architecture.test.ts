import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ROOT } from "./helpers/env.js";

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = path.join(dir, name);
    return statSync(p).isDirectory() ? files(p) : p.endsWith(".ts") ? [p] : [];
  });
}
const SRC = path.join(ROOT, "src");
const rel = (p: string) => path.relative(SRC, p).split(path.sep).join("/");

describe("architecture", () => {
  it("only src/config.ts reads process.env", () => {
    const offenders = files(SRC).filter((f) => rel(f) !== "config.ts" && /process\.env/.test(readFileSync(f, "utf8")));
    expect(offenders.map(rel)).toEqual([]);
  });

  it("services/ and repositories/ don't import express", () => {
    const offenders = files(SRC).filter(
      (f) => /^(services|repositories)\//.test(rel(f)) && /from\s+["']express["']/.test(readFileSync(f, "utf8")),
    );
    expect(offenders.map(rel)).toEqual([]);
  });

  it("no console.* in src/: everything goes through the structured logger", () => {
    const offenders = files(SRC).filter((f) => /\bconsole\.(log|info|warn|error|debug)\(/.test(readFileSync(f, "utf8")));
    expect(offenders.map(rel)).toEqual([]);
  });
});
