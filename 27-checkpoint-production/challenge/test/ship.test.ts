import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { execForm, healthcheckCommand, parseDockerfile, splitStages, type Stage } from "./helpers/dockerfile.js";
import { ROOT, readProjectFile } from "./helpers/env.js";

function load() {
  const stages = splitStages(parseDockerfile(readProjectFile("Dockerfile")));
  if (stages.length === 0) throw new Error("Dockerfile has no FROM instruction yet");
  return { stages, final: stages[stages.length - 1]! };
}
const runs = (s: Stage) => s.instructions.filter((i) => i.keyword === "RUN").map((i) => i.args);
const omitsDev = (cmd: string) => /npm (ci|prune)\b.*(--omit[= ]dev|--production)/.test(cmd);

describe("Dockerfile", () => {
  it("is multi-stage, pinned to Node 22, and installs with npm ci only", () => {
    const { stages } = load();
    expect(stages.length).toBeGreaterThanOrEqual(2);
    const names = new Set(stages.map((s) => s.name).filter(Boolean));
    for (const s of stages) {
      if (!names.has(s.base.toLowerCase())) expect(s.base).toMatch(/^node:22([.-][\w.-]+)?(@sha256:[a-f0-9]+)?$/);
      for (const r of runs(s)) expect(r).not.toMatch(/\bnpm (install|i)\b/);
    }
    expect(stages.some((s) => runs(s).some((r) => /npm run build|\btsc\b/.test(r))), "compile TypeScript in a build stage").toBe(true);
  });

  it("ships production dependencies only, plus dist/ and migrations/", () => {
    const { stages, final } = load();
    const copiedFrom = final.instructions
      .filter((i) => i.keyword === "COPY" && /--from=/.test(i.args) && /node_modules/.test(i.args))
      .map((i) => /--from=(\S+)/.exec(i.args)![1]!.toLowerCase());
    const prodDeps =
      runs(final).some(omitsDev) || copiedFrom.some((n) => stages.some((s) => s.name === n && runs(s).some(omitsDev)));
    expect(prodDeps, "npm ci --omit=dev in the final stage or in a stage it copies node_modules from").toBe(true);
    const copies = final.instructions.filter((i) => i.keyword === "COPY").map((i) => i.args);
    expect(copies.some((a) => /--from=/.test(a) && /\bdist\b/.test(a))).toBe(true);
    expect(copies.some((a) => /\bmigrations\b/.test(a))).toBe(true);
  });

  it("runs as non-root with NODE_ENV=production, a node-based HEALTHCHECK and an exec-form node CMD", () => {
    const { final } = load();
    const kw = final.instructions.map((i) => i.keyword);
    const userIdx = kw.lastIndexOf("USER");
    expect(userIdx, "USER in the final stage").toBeGreaterThan(0);
    expect(["root", "0"]).not.toContain(final.instructions[userIdx]!.args.split(":")[0]);
    expect(final.instructions.some((i) => i.keyword === "ENV" && /NODE_ENV[= ]"?production/.test(i.args))).toBe(true);

    const hc = final.instructions.find((i) => i.keyword === "HEALTHCHECK");
    expect(hc && healthcheckCommand(hc.args), "HEALTHCHECK ... CMD").toBeTruthy();
    expect(healthcheckCommand(hc!.args)).toMatch(/\bnode\b/);

    const cmd = final.instructions.filter((i) => i.keyword === "CMD").at(-1);
    const argv = cmd && execForm(cmd.args);
    expect(argv, 'exec-form CMD ["node", "dist/…js"]').toBeDefined();
    expect(argv![0]).toBe("node");
    const script = argv!.find((a) => a.endsWith(".js"))!;
    const source = script.replace(/^(\.\/)?dist\//, "src/").replace(/\.js$/, ".ts");
    expect(existsSync(path.join(ROOT, source)), `${script} must be compiled from an existing ${source}`).toBe(true);
    expect(userIdx).toBeLessThan(kw.lastIndexOf("CMD"));
  });

  it("has a .dockerignore that keeps node_modules, .git and env files out", () => {
    const lines = readProjectFile(".dockerignore")
      .split(/\r?\n/)
      .map((l) => l.trim().replace(/^\/|^\*\*\//, "").replace(/\/$/, ""))
      .filter((l) => l && !l.startsWith("#"));
    expect(lines).toContain("node_modules");
    expect(lines).toContain(".git");
    expect(lines.some((l) => l === ".env" || l === ".env*")).toBe(true);
  });
});
