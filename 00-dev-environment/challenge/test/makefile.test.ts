import { describe, expect, it } from "vitest";
import { readProjectFile } from "./helpers/files.js";

interface Target {
  name: string;
  recipe: string[];
}

/**
 * A tiny Makefile parser: finds `name: deps` lines and collects the TAB-indented recipe lines
 * under each one. Lines indented with spaces are recorded separately, because `make` rejects them
 * ("missing separator") and that's the #1 Makefile mistake.
 */
function parseMakefile(src: string) {
  const targets = new Map<string, Target>();
  const phony = new Set<string>();
  const spaceIndented: string[] = [];
  let current: Target | undefined;

  for (const line of src.split(/\r?\n/)) {
    if (line.startsWith("\t")) {
      current?.recipe.push(line.trim());
      continue;
    }
    if (/^ +\S/.test(line) && current) {
      spaceIndented.push(line);
      continue;
    }
    const phonyMatch = /^\.PHONY\s*:(.*)$/.exec(line);
    if (phonyMatch) {
      phonyMatch[1]!.split(/\s+/).filter(Boolean).forEach((t) => phony.add(t));
      current = undefined;
      continue;
    }
    const targetMatch = /^([A-Za-z0-9][\w-]*)\s*:(?!=)/.exec(line);
    if (targetMatch) {
      current = { name: targetMatch[1]!, recipe: [] };
      targets.set(current.name, current);
      continue;
    }
    if (line.trim() && !line.trim().startsWith("#")) current = undefined;
  }
  return { targets, phony, spaceIndented };
}

const REQUIRED = ["install", "up", "down", "test", "reset", "dev", "logs", "psql", "redis-cli"];

function recipeOf(name: string): string {
  const { targets } = parseMakefile(readProjectFile("Makefile"));
  const target = targets.get(name);
  if (!target) throw new Error(`Makefile has no "${name}:" target (TODO 2)`);
  return target.recipe.join("\n");
}

describe("Makefile (TODO 2)", () => {
  it.each(REQUIRED)("defines the %s target", (name) => {
    const { targets } = parseMakefile(readProjectFile("Makefile"));
    expect([...targets.keys()], `add a "${name}:" target`).toContain(name);
  });

  it("declares every required target as .PHONY", () => {
    const { phony } = parseMakefile(readProjectFile("Makefile"));
    const missing = REQUIRED.filter((t) => !phony.has(t));
    expect(missing, "these targets are missing from .PHONY").toEqual([]);
  });

  it("indents recipe lines with TABs, not spaces", () => {
    const { spaceIndented } = parseMakefile(readProjectFile("Makefile"));
    expect(spaceIndented, "make requires a TAB before each recipe line").toEqual([]);
  });

  it("every required target has a recipe", () => {
    const { targets } = parseMakefile(readProjectFile("Makefile"));
    const empty = REQUIRED.filter((t) => targets.has(t) && targets.get(t)!.recipe.length === 0);
    expect(empty, "these targets have no recipe lines").toEqual([]);
  });

  it("up starts services detached and waits for healthchecks", () => {
    const recipe = recipeOf("up");
    expect(recipe).toMatch(/docker compose up/);
    expect(recipe, "use -d so it runs in the background").toMatch(/(\s-d\b|--detach)/);
    expect(recipe, "use --wait so `make up` returns only when services are healthy").toMatch(/--wait/);
  });

  it("down stops services without deleting volumes", () => {
    const recipe = recipeOf("down");
    expect(recipe).toMatch(/docker compose down/);
    expect(recipe, "down should keep data; that's what reset is for").not.toMatch(/(\s-v\b|--volumes)/);
  });

  it("reset removes volumes and reinstalls dependencies", () => {
    const recipe = recipeOf("reset");
    expect(recipe).toMatch(/docker compose down\b.*(\s-v\b|--volumes)/);
    expect(recipe).toMatch(/rm -rf.*node_modules/);
    expect(recipe).toMatch(/npm (install|ci)/);
  });

  it("logs follows compose logs", () => {
    expect(recipeOf("logs")).toMatch(/docker compose logs\b.*(\s-f\b|--follow)/);
  });

  it("psql opens psql in the postgres container as user postgres on wl_00", () => {
    const recipe = recipeOf("psql");
    expect(recipe).toMatch(/docker compose exec\b.*\bpostgres\b.*\bpsql\b/);
    expect(recipe).toMatch(/-U\s*postgres/);
    expect(recipe).toMatch(/-d\s*wl_00/);
  });

  it("redis-cli opens redis-cli in the redis container", () => {
    expect(recipeOf("redis-cli")).toMatch(/docker compose exec\b.*\bredis\b.*\bredis-cli\b/);
  });

  it("install and test still use npm", () => {
    expect(recipeOf("install")).toMatch(/npm (install|ci)/);
    expect(recipeOf("test")).toMatch(/npm (test|run test)/);
  });
});
