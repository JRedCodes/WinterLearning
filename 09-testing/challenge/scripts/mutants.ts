/**
 * Mutation check: how good are your tests at noticing broken code?
 *
 * Every file in mutants/ is a full copy of ONE src file with a small change
 * (a flipped comparison, a forgotten step...). Its first lines say which
 * file it replaces:
 *
 *   // @mutant-of: src/services/walletService.ts
 *   // @mutant: what was changed, in plain words
 *
 * For each mutant we copy the project to a temp dir, swap the file in, and
 * run your tests there. Tests that FAIL "kill" the mutant (good). Tests that
 * still PASS let it "survive": nothing in your suite checks that behavior.
 *
 * Usage: npm run mutants [-- <name-filter>]
 */
import { spawn } from "node:child_process";
import { cp, mkdtemp, readdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { pathToFileURL } from "node:url";

export interface Mutant {
  name: string;
  target: string;
  description: string;
  content: string;
}

export interface SuiteRun {
  passed: boolean;
  durationMs: number;
  output: string;
}

export interface MutantResult {
  name: string;
  target: string;
  description: string;
  status: "killed" | "survived";
  durationMs: number;
}

export interface MutationReport {
  baseline: SuiteRun;
  mutants: MutantResult[];
}

const COPY_ENTRIES = ["src", "test", "migrations", "scripts", "package.json", "tsconfig.json", "vitest.config.ts"];
const SUITE_TIMEOUT_MS = 90_000;

export async function loadMutants(projectDir: string): Promise<Mutant[]> {
  const dir = join(projectDir, "mutants");
  const files = (await readdir(dir)).filter((f) => f.endsWith(".ts")).sort();
  return Promise.all(
    files.map(async (file) => {
      const content = await readFile(join(dir, file), "utf8");
      const target = /^\/\/ @mutant-of: (\S+)/m.exec(content)?.[1];
      const description = /^\/\/ @mutant: (.+)$/m.exec(content)?.[1] ?? "";
      if (!target) throw new Error(`mutants/${file} is missing its "// @mutant-of: <path>" header`);
      return { name: basename(file, ".ts"), target, description, content };
    }),
  );
}

/** Runs the learner's tests (not the grading test) in `cwd`. */
function runSuite(cwd: string, bail: boolean): Promise<SuiteRun> {
  const started = Date.now();
  const vitest = join(cwd, "node_modules", "vitest", "vitest.mjs");
  const args = [vitest, "run", "--reporter=dot", ...(bail ? ["--bail=1"] : [])];
  return new Promise((resolve) => {
    const child = spawn(process.execPath, args, {
      cwd,
      env: { ...process.env, WL_MUTANT_RUN: "1", FORCE_COLOR: "0", NO_COLOR: "1" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    child.stdout.on("data", (d: Buffer) => (output += d.toString()));
    child.stderr.on("data", (d: Buffer) => (output += d.toString()));
    const timer = setTimeout(() => {
      output += `\n[mutants] suite timed out after ${SUITE_TIMEOUT_MS / 1000}s`;
      child.kill("SIGKILL");
    }, SUITE_TIMEOUT_MS);
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ passed: code === 0, durationMs: Date.now() - started, output });
    });
  });
}

export async function runMutationCheck(opts: { projectDir: string; filter?: string }): Promise<MutationReport> {
  const { projectDir } = opts;
  const mutants = (await loadMutants(projectDir)).filter((m) => !opts.filter || m.name.includes(opts.filter));
  const work = await mkdtemp(join(tmpdir(), "wl09-mutants-"));
  try {
    for (const entry of COPY_ENTRIES) {
      await cp(join(projectDir, entry), join(work, entry), { recursive: true });
    }
    await symlink(join(projectDir, "node_modules"), join(work, "node_modules"), "dir");

    const baseline = await runSuite(work, false);
    if (!baseline.passed) return { baseline, mutants: [] };

    const results: MutantResult[] = [];
    for (const m of mutants) {
      const targetPath = join(work, m.target);
      const original = await readFile(targetPath, "utf8");
      await writeFile(targetPath, m.content);
      try {
        const run = await runSuite(work, true);
        results.push({
          name: m.name,
          target: m.target,
          description: m.description,
          status: run.passed ? "survived" : "killed",
          durationMs: run.durationMs,
        });
      } finally {
        await writeFile(targetPath, original);
      }
    }
    return { baseline, mutants: results };
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}

function tail(text: string, lines: number): string {
  return text.trim().split("\n").slice(-lines).join("\n");
}

export function formatReport(report: MutationReport): string {
  if (!report.baseline.passed) {
    return [
      "BASELINE FAILED: your tests fail on the real code in src/.",
      "Either a test is wrong, or it found a real bug (there are 2!) that you still need to fix in src/.",
      "Last lines of the test output:",
      "",
      tail(report.baseline.output, 40),
    ].join("\n");
  }
  const killed = report.mutants.filter((m) => m.status === "killed").length;
  const rows = report.mutants.map(
    (m) =>
      `  ${m.status === "killed" ? "KILLED  " : "SURVIVED"}  ${m.name.padEnd(30)} ${m.target}\n` +
      `            ${m.description}`,
  );
  return [
    `Baseline: your tests pass on the real code (${(report.baseline.durationMs / 1000).toFixed(1)}s).`,
    `Mutants killed: ${killed}/${report.mutants.length}`,
    ...rows,
  ].join("\n");
}

// CLI entry point
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const projectDir = join(import.meta.dirname, "..");
  const report = await runMutationCheck({ projectDir, filter: process.argv[2] });
  console.log(formatReport(report));
  const ok = report.baseline.passed && report.mutants.every((m) => m.status === "killed");
  process.exit(ok ? 0 : 1);
}
