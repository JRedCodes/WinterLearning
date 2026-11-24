/**
 * A tiny architecture linter, run by `npm run lint` (and by your CI workflow).
 * Real projects use ESLint; this keeps the module dependency-free while still giving CI
 * a meaningful "lint" step. Rules:
 *   1. process.env is only read in src/config.ts
 *   2. no console.* in src/ (use the logger, which writes structured JSON lines)
 *   3. services/ and repositories/ never import express
 */
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

async function walk(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : Promise.resolve([path.join(dir, e.name)]))),
  );
  return nested.flat().filter((f) => f.endsWith(".ts"));
}

export async function lint(root = "src"): Promise<string[]> {
  const problems: string[] = [];
  for (const file of await walk(root)) {
    const rel = path.relative(root, file).split(path.sep).join("/");
    const code = await readFile(file, "utf8");
    if (rel !== "config.ts" && /process\.env/.test(code)) problems.push(`${file}: reads process.env (only config.ts may)`);
    if (/\bconsole\.(log|info|warn|error|debug)\(/.test(code)) problems.push(`${file}: uses console.* (use the logger)`);
    if (/^(services|repositories)\//.test(rel) && /from\s+["']express["']/.test(code)) {
      problems.push(`${file}: imports express (keep HTTP out of services/repositories)`);
    }
  }
  return problems;
}
