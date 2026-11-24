#!/usr/bin/env node
/**
 * Progress tracker for WinterLearning.
 *
 *   npm run progress                 re-render the roadmap in README.md from .progress.json
 *   npm run progress -- 05           run module 05's tests; if they pass, mark it done
 *   npm run progress -- 05 --force   mark done without running tests (e.g. docs-only work you reviewed yourself)
 *   npm run progress -- --undo 05    unmark a module
 *   npm run progress -- --all        re-check every module that has node_modules installed
 *   npm run progress -- next         print the next unfinished module
 *
 * Only Node built-ins are used, so it works without `npm install` at the root.
 */
import { execSync, spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const STATE_FILE = join(ROOT, ".progress.json");
const README = join(ROOT, "README.md");

const TYPE_ICON = { build: "🛠️ Build", scaffold: "🧩 Scaffold", debug: "🐛 Debug", docs: "📝 Docs" };
const SERVICE_ICON = { postgres: "🐘", redis: "🟥", kafka: "📨" };

// ---------------------------------------------------------------------------
function loadModules() {
  return readdirSync(ROOT, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(join(ROOT, d.name, "module.json")))
    .map((d) => ({ dir: d.name, ...JSON.parse(readFileSync(join(ROOT, d.name, "module.json"), "utf8")) }))
    .sort((a, b) => orderKey(a) - orderKey(b) || a.dir.localeCompare(b.dir));
}

// React track sits between Phase 5 and Phase 6 in reading order; numbered modules sort by id.
function orderKey(m) {
  if (/^R\d/i.test(m.id)) return 31.5 + Number(m.id.slice(1)) / 10;
  return Number(m.id);
}

function loadState() {
  if (!existsSync(STATE_FILE)) return { completed: {} };
  return JSON.parse(readFileSync(STATE_FILE, "utf8"));
}

function saveState(state) {
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2) + "\n");
}

function findModule(modules, idOrDir) {
  const key = String(idOrDir).toLowerCase();
  return modules.find((m) => m.id.toLowerCase() === key || m.dir.toLowerCase() === key || m.dir.toLowerCase().startsWith(key + "-"));
}

// ---------------------------------------------------------------------------
function runTests(mod) {
  const cwd = join(ROOT, mod.dir, "challenge");
  if (!existsSync(cwd)) {
    console.error(`✗ ${mod.dir} has no challenge/ folder`);
    return false;
  }
  if (!existsSync(join(cwd, "node_modules"))) {
    console.log(`… installing dependencies for ${mod.dir}`);
    execSync("npm install --no-audit --no-fund", { cwd, stdio: "inherit" });
  }
  if (mod.services?.length) {
    console.log(`ℹ ${mod.dir} needs: ${mod.services.join(", ")}. If tests can't connect, run \`make up\` in ${mod.dir}/challenge.`);
  }
  console.log(`▶ running tests for ${mod.dir}\n`);
  const res = spawnSync("npm", ["test"], { cwd, stdio: "inherit", shell: process.platform === "win32" });
  return res.status === 0;
}

// ---------------------------------------------------------------------------
function bar(fraction, width = 30) {
  const filled = Math.round(fraction * width);
  return "█".repeat(filled) + "░".repeat(width - filled);
}

function render(modules, state) {
  const done = (m) => Boolean(state.completed[m.id]);
  const total = modules.length;
  const completed = modules.filter(done).length;
  const hoursTotal = modules.reduce((s, m) => s + (m.estimateHours ?? 0), 0);
  const hoursDone = modules.filter(done).reduce((s, m) => s + (m.estimateHours ?? 0), 0);
  const next = modules.find((m) => !done(m));
  const pct = total ? Math.round((completed / total) * 100) : 0;

  const progress = [
    `![progress](https://img.shields.io/badge/modules-${completed}%2F${total}-6f42c1?style=for-the-badge) ` +
      `![hours](https://img.shields.io/badge/hours-${hoursDone}%2F${hoursTotal}-0e8a16?style=for-the-badge) ` +
      `![complete](https://img.shields.io/badge/complete-${pct}%25-1f6feb?style=for-the-badge)`,
    "",
    "```",
    `${bar(total ? completed / total : 0)}  ${pct}%  (${completed}/${total} modules · ~${hoursDone}/${hoursTotal}h)`,
    "```",
    "",
    next
      ? `**👉 Up next:** [${next.id} · ${next.title}](${next.dir}/README.md) (${TYPE_ICON[next.challengeType] ?? next.challengeType}, ~${next.estimateHours}h)`
      : "**🎉 Everything is complete. Go ship it.**",
  ].join("\n");

  // Group by phase, in order of appearance.
  const groups = [];
  for (const m of modules) {
    const name = m.phaseName ?? `Phase ${m.phase}`;
    const label = typeof m.phase === "number" ? `Phase ${m.phase} · ${name}` : name;
    let g = groups.find((x) => x.label === label);
    if (!g) groups.push((g = { label, items: [] }));
    g.items.push(m);
  }

  const sections = groups.map((g) => {
    const gDone = g.items.filter(done).length;
    const rows = g.items.map((m) => {
      const status = done(m) ? `✅ ${state.completed[m.id]}` : m === next ? "👉 next" : "⬜";
      const services = (m.services ?? []).map((s) => SERVICE_ICON[s] ?? s).join(" ") || "—";
      return `| ${status} | \`${m.id}\` | [${m.title}](${m.dir}/README.md) | ${TYPE_ICON[m.challengeType] ?? m.challengeType} | ${m.estimateHours}h | ${services} |`;
    });
    return [
      `### ${g.label}  \`${gDone}/${g.items.length}\``,
      "",
      "| Status | # | Module | Challenge | Est. | Services |",
      "|:--:|:--:|---|---|:--:|:--:|",
      ...rows,
    ].join("\n");
  });

  return { progress, roadmap: sections.join("\n\n") };
}

function replaceBetween(text, tag, content) {
  const start = `<!-- ${tag}:START -->`;
  const end = `<!-- ${tag}:END -->`;
  const re = new RegExp(`${start}[\\s\\S]*?${end}`);
  if (!re.test(text)) throw new Error(`README.md is missing the ${start} / ${end} markers`);
  return text.replace(re, `${start}\n${content}\n${end}`);
}

function writeReadme(modules, state) {
  const { progress, roadmap } = render(modules, state);
  let text = readFileSync(README, "utf8");
  text = replaceBetween(text, "PROGRESS", progress);
  text = replaceBetween(text, "ROADMAP", roadmap);
  writeFileSync(README, text);
}

// ---------------------------------------------------------------------------
function main() {
  const args = process.argv.slice(2);
  const modules = loadModules();
  const state = loadState();
  const today = new Date().toISOString().slice(0, 10);

  if (args[0] === "next") {
    const next = modules.find((m) => !state.completed[m.id]);
    console.log(next ? `👉 ${next.dir}: ${next.title} (~${next.estimateHours}h)\n   ${next.summary ?? ""}` : "🎉 all done");
    return;
  }

  if (args[0] === "--undo") {
    const mod = findModule(modules, args[1]);
    if (!mod) return fail(`unknown module "${args[1]}"`);
    delete state.completed[mod.id];
    saveState(state);
    writeReadme(modules, state);
    console.log(`↩︎ unmarked ${mod.dir}`);
    return;
  }

  if (args[0] === "--all") {
    for (const mod of modules) {
      if (!existsSync(join(ROOT, mod.dir, "challenge", "node_modules"))) continue;
      const ok = runTests(mod);
      if (ok) state.completed[mod.id] ??= today;
      console.log(ok ? `✅ ${mod.dir}` : `❌ ${mod.dir}`);
    }
    saveState(state);
    writeReadme(modules, state);
    return;
  }

  if (args[0]) {
    const mod = findModule(modules, args[0]);
    if (!mod) return fail(`unknown module "${args[0]}". Try an id like 05 or R1.`);
    const ok = args.includes("--force") || runTests(mod);
    if (!ok) {
      console.log(`\n❌ ${mod.dir}: tests are failing. Keep going! Stuck? See ${mod.dir}/HINTS.md`);
      process.exitCode = 1;
      return;
    }
    state.completed[mod.id] = today;
    saveState(state);
    writeReadme(modules, state);
    const done = modules.filter((m) => state.completed[m.id]).length;
    console.log(`\n✅ ${mod.dir} complete (${done}/${modules.length}). Roadmap updated in README.md.`);
    console.log(`   Next: answer ${mod.dir}/INTERVIEW.md, add a LOG.md entry, then: npm run progress -- next`);
    return;
  }

  writeReadme(modules, state);
  console.log("roadmap re-rendered");
}

function fail(msg) {
  console.error(`✗ ${msg}`);
  process.exitCode = 1;
}

main();
