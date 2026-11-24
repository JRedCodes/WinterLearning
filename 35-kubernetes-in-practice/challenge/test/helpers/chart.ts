/**
 * Helm templates are Go templates, not YAML, so we can't parse them without Helm.
 * Instead these helpers read them as text: strip comments, find `.Values.x.y` references,
 * and check block structure. values.yaml and Chart.yaml ARE plain YAML and get parsed.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { parse } from "yaml";
import { ROOT } from "./manifests.js";

export const CHART_DIR = path.join(ROOT, "chart");

export function chartFile(rel: string): string {
  const p = path.join(CHART_DIR, rel);
  return existsSync(p) ? readFileSync(p, "utf8") : "";
}

export function chartYaml(rel: string): any {
  const text = chartFile(rel);
  return text ? parse(text) : undefined;
}

/** Template text without `{{/* ... *\/}}` comments and without whole-line `#` comments. */
export function templateCode(rel: string): string {
  return chartFile(rel)
    .replace(/\{\{-?\s*\/\*[\s\S]*?\*\/\s*-?\}\}/g, "")
    .split("\n")
    .filter((line) => !/^\s*#/.test(line))
    .join("\n")
    .trim();
}

/** Every `.Values.a.b.c` path referenced in a template (also `$.Values...`). */
export function valuesRefs(code: string): string[] {
  return [...new Set([...code.matchAll(/\$?\.Values((?:\.[A-Za-z_][A-Za-z0-9_]*)+)/g)].map((m) => m[1]!.slice(1)))];
}

/** Does `a.b.c` exist in the parsed values object? */
export function hasPath(obj: unknown, dotted: string): boolean {
  let cur: unknown = obj;
  for (const key of dotted.split(".")) {
    if (cur === null || typeof cur !== "object" || !(key in (cur as Record<string, unknown>))) return false;
    cur = (cur as Record<string, unknown>)[key];
  }
  return true;
}

export function getPath(obj: unknown, dotted: string): unknown {
  let cur: unknown = obj;
  for (const key of dotted.split(".")) {
    if (cur === null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[key];
  }
  return cur;
}

/** Opening block actions (if/range/with/define/block) vs `end`: they must balance. */
export function blockBalance(code: string): { opens: number; ends: number; braces: [number, number] } {
  const actions = [...code.matchAll(/\{\{-?\s*(if|range|with|define|block|end)\b/g)].map((m) => m[1]);
  return {
    opens: actions.filter((a) => a !== "end").length,
    ends: actions.filter((a) => a === "end").length,
    braces: [(code.match(/\{\{/g) ?? []).length, (code.match(/\}\}/g) ?? []).length],
  };
}
